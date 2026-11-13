"""Train improved models on real historical matches (no synthetic)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, balanced_accuracy_score, log_loss, mean_absolute_error
from sklearn.preprocessing import LabelEncoder

from calibration import apply_multiclass_isotonic, fit_multiclass_isotonic
from dixon_coles import build_dixon_coles_score_matrix, fit_dixon_coles_rho
from evaluation_metrics import assert_strictly_chronological, date_range, multiclass_brier_score, top_label_calibration
from features import FEATURES, build_training_frame, load_matches
from markets import build_poisson_score_matrix

MODEL_VERSION = "hgb-elo-h2h-venue-dc-v6"


def _result_metrics(y_true, proba, pred, classes) -> dict:
    return {
        "accuracy": float(accuracy_score(y_true, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_true, pred)),
        "log_loss": float(log_loss(y_true, proba, labels=list(classes))),
        "multiclass_brier_score": multiclass_brier_score(y_true, proba, classes),
        "top_label_calibration_bins": top_label_calibration(y_true, proba, pred),
    }


def _score_model_1x2(home_xg: float, away_xg: float, rho: float) -> str:
    if abs(rho) < 1e-12:
        matrix, _meta = build_poisson_score_matrix(home_xg, away_xg)
    else:
        matrix, _meta = build_dixon_coles_score_matrix(home_xg, away_xg, rho)
    home = draw = away = 0.0
    for (home_goals, away_goals), probability in matrix.items():
        if home_goals > away_goals:
            home += probability
        elif home_goals == away_goals:
            draw += probability
        else:
            away += probability
    return max((("H", home), ("D", draw), ("A", away)), key=lambda item: item[1])[0]


def _chronological_masks(frame: pd.DataFrame) -> tuple[pd.Series, pd.Series, pd.Series, str]:
    """Return fit/calibration/holdout masks.

    Small fixtures keep a two-way split and skip calibration so unit tests stay valid.
    Real datasets use 70% fit, 15% calibration, 15% holdout by distinct match date.
    """
    match_days = frame["match_date"].dt.normalize()
    days = list(match_days.drop_duplicates().sort_values())
    if len(frame) < 200 or len(days) < 40:
        cutoff = days[max(1, int(len(days) * 0.8))]
        fit_mask = match_days < cutoff
        cal_mask = match_days < pd.Timestamp("1677-01-01", tz="UTC")  # empty
        if fit_mask.sum() == 0:
            cutoff = days[1]
            fit_mask = match_days < cutoff
        holdout_mask = ~fit_mask
        return fit_mask, cal_mask, holdout_mask, "two_way_no_calibration"
    fit_cut = days[int(len(days) * 0.70)]
    cal_cut = days[int(len(days) * 0.85)]
    if not (fit_cut < cal_cut):
        raise ValueError("Could not form a calibration window after the training window.")
    fit_mask = match_days < fit_cut
    cal_mask = (match_days >= fit_cut) & (match_days < cal_cut)
    holdout_mask = match_days >= cal_cut
    return fit_mask, cal_mask, holdout_mask, "three_way"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()

    raw = load_matches(args.data)
    if "source" in raw.columns and raw["source"].astype(str).str.lower().eq("synthetic").any():
        raise SystemExit("Refusing to train on synthetic-only data or any dataset containing synthetic rows. Use verified real match data.")

    frame = build_training_frame(raw).sort_values("match_date", kind="stable").reset_index(drop=True)
    if len(frame) < 50:
        raise ValueError("At least 50 completed matches are required.")

    fit_mask, cal_mask, holdout_mask, split_mode = _chronological_masks(frame)
    fit_frame = frame.loc[fit_mask].copy()
    cal_frame = frame.loc[cal_mask].copy()
    holdout_frame = frame.loc[holdout_mask].copy()
    if len(fit_frame) < 40 or holdout_frame.empty:
        raise ValueError("Insufficient data after enforcing a strict date-based holdout.")
    assert_strictly_chronological(fit_frame["match_date"], holdout_frame["match_date"])
    if split_mode == "three_way":
        if len(cal_frame) < 30:
            raise ValueError("Calibration window is too small.")
        assert_strictly_chronological(fit_frame["match_date"], cal_frame["match_date"])
        assert_strictly_chronological(cal_frame["match_date"], holdout_frame["match_date"])

    encoder = LabelEncoder().fit(["A", "D", "H"])
    classes = list(encoder.classes_)
    X_fit = fit_frame[list(FEATURES)].astype(float)
    y_fit = encoder.transform(fit_frame["result"].astype(str))

    classifier = HistGradientBoostingClassifier(
        max_depth=5, learning_rate=0.06, max_iter=300, min_samples_leaf=20,
        l2_regularization=0.1, random_state=42,
    )
    home_model = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=42
    )
    away_model = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=43
    )
    classifier.fit(X_fit, y_fit)
    home_model.fit(X_fit, fit_frame["home_goals"])
    away_model.fit(X_fit, fit_frame["away_goals"])

    calibrators = None
    calibration_decision = "skipped_small_dataset"
    rho_info = {"rho": 0.0, "matches": 0, "status": "skipped_small_dataset", "split_mode": split_mode}
    if split_mode == "three_way":
        cal_days = list(cal_frame["match_date"].dt.normalize().drop_duplicates().sort_values())
        cal_check_cut = cal_days[max(1, int(len(cal_days) * 0.7))]
        cal_fit_frame = cal_frame[cal_frame["match_date"].dt.normalize() < cal_check_cut]
        cal_check_frame = cal_frame[cal_frame["match_date"].dt.normalize() >= cal_check_cut]
        if len(cal_fit_frame) >= 30 and len(cal_check_frame) >= 20:
            raw_check = classifier.predict_proba(cal_check_frame[list(FEATURES)].astype(float))
            trial = fit_multiclass_isotonic(
                classifier.predict_proba(cal_fit_frame[list(FEATURES)].astype(float)),
                cal_fit_frame["result"].astype(str).to_numpy(),
                classes,
            )
            adjusted_check = apply_multiclass_isotonic(raw_check, trial)
            raw_ll = float(log_loss(cal_check_frame["result"].astype(str), raw_check, labels=classes))
            adjusted_ll = float(log_loss(cal_check_frame["result"].astype(str), adjusted_check, labels=classes))
            if adjusted_ll + 0.01 < raw_ll:
                calibrators = fit_multiclass_isotonic(
                    classifier.predict_proba(X_cal := cal_frame[list(FEATURES)].astype(float)),
                    cal_frame["result"].astype(str).to_numpy(),
                    classes,
                )
                calibration_decision = "kept_log_loss_improved_on_calibration_check"
            else:
                calibration_decision = "rejected_no_log_loss_gain_on_calibration_check"
            calibration_decision += f" raw={raw_ll:.4f} calibrated={adjusted_ll:.4f}"
        else:
            calibration_decision = "skipped_calibration_check_too_small"
        X_cal = cal_frame[list(FEATURES)].astype(float)
        cal_home_xg = np.clip(home_model.predict(X_cal), 0.05, 5.0)
        cal_away_xg = np.clip(away_model.predict(X_cal), 0.05, 5.0)
        rho_info = fit_dixon_coles_rho(
            cal_frame["home_goals"].to_numpy(),
            cal_frame["away_goals"].to_numpy(),
            cal_home_xg,
            cal_away_xg,
        )
        rho_info["split_mode"] = split_mode

    X_holdout = holdout_frame[list(FEATURES)].astype(float)
    y_holdout = holdout_frame["result"].astype(str)
    raw_proba = classifier.predict_proba(X_holdout)
    calibrated_proba = apply_multiclass_isotonic(raw_proba, calibrators) if calibrators else raw_proba
    raw_pred = encoder.inverse_transform(np.argmax(raw_proba, axis=1))
    cal_pred = encoder.inverse_transform(np.argmax(calibrated_proba, axis=1))
    baseline_class = fit_frame["result"].astype(str).value_counts().idxmax()
    baseline_pred = [baseline_class] * len(y_holdout)

    holdout_home_xg = np.clip(home_model.predict(X_holdout), 0.05, 5.0)
    holdout_away_xg = np.clip(away_model.predict(X_holdout), 0.05, 5.0)
    rho = float(rho_info["rho"])
    poisson_labels = [
        _score_model_1x2(float(h), float(a), 0.0)
        for h, a in zip(holdout_home_xg, holdout_away_xg)
    ]
    dixon_labels = [
        _score_model_1x2(float(h), float(a), rho)
        for h, a in zip(holdout_home_xg, holdout_away_xg)
    ]

    metrics = {
        "fit_matches": int(len(fit_frame)),
        "calibration_matches": int(len(cal_frame)),
        "holdout_matches": int(len(holdout_frame)),
        "split_mode": split_mode,
        "fit_date_range": date_range(fit_frame["match_date"]),
        "calibration_date_range": date_range(cal_frame["match_date"]) if len(cal_frame) else None,
        "holdout_date_range": date_range(holdout_frame["match_date"]),
        "uncalibrated": _result_metrics(y_holdout, raw_proba, raw_pred, classes),
        "isotonic_calibrated": _result_metrics(y_holdout, calibrated_proba, cal_pred, classes),
        "majority_baseline_class_from_training": str(baseline_class),
        "majority_baseline_accuracy": float(accuracy_score(y_holdout, baseline_pred)),
        "home_goals_mae": float(mean_absolute_error(holdout_frame["home_goals"], holdout_home_xg)),
        "away_goals_mae": float(mean_absolute_error(holdout_frame["away_goals"], holdout_away_xg)),
        "independent_poisson_1x2_accuracy": float(accuracy_score(y_holdout, poisson_labels)),
        "dixon_coles_1x2_accuracy": float(accuracy_score(y_holdout, dixon_labels)),
        "dixon_coles": rho_info,
        "calibration_decision": calibration_decision,
        "evaluation_note": (
            "Classifier, goal models, isotonic calibrators, and Dixon–Coles rho are fit only on "
            "matches before the holdout. The calibrators and rho use the calibration window, which "
            "the weight-fitting step does not see. The holdout is not used to fit or choose rho."
        ),
    }
    # Keep the previous flat keys so older readers still see a result accuracy.
    metrics["result_accuracy"] = metrics["isotonic_calibrated"]["accuracy"]
    metrics["balanced_accuracy"] = metrics["isotonic_calibrated"]["balanced_accuracy"]
    metrics["log_loss"] = metrics["isotonic_calibrated"]["log_loss"]
    metrics["multiclass_brier_score"] = metrics["isotonic_calibrated"]["multiclass_brier_score"]
    metrics["top_label_calibration_bins"] = metrics["isotonic_calibrated"]["top_label_calibration_bins"]

    out = Path(args.models_dir)
    out.mkdir(parents=True, exist_ok=True)
    trained_until = fit_frame["match_date"].max().isoformat()
    synthetic_data = bool("source" in raw.columns and (raw["source"] == "synthetic").all())
    joblib.dump(
        {
            "model": classifier,
            "encoder": encoder,
            "isotonic_calibrators": calibrators,
            "features": list(FEATURES),
            "trained_until": trained_until,
            "synthetic_data": synthetic_data,
            "data_path": str(Path(args.data)),
            "feature_version": "elo-h2h-venue-v5",
            "model_version": MODEL_VERSION,
            "calibration": "chronological_isotonic_one_vs_rest",
        },
        out / "result.joblib",
    )
    joblib.dump(home_model, out / "home_goals.joblib")
    joblib.dump(away_model, out / "away_goals.joblib")
    (out / "dixon_coles.json").write_text(json.dumps(rho_info, indent=2) + "\n")
    (out / "evaluation.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps({
        "trained_matches": int(len(fit_frame)),
        "synthetic_data": synthetic_data,
        "data_path": str(Path(args.data)),
        "trained_until": trained_until,
        "model_version": MODEL_VERSION,
        "feature_count": len(FEATURES),
        "dixon_coles_rho": rho,
        "evaluation": {
            "holdout_matches": metrics["holdout_matches"],
            "uncalibrated_log_loss": metrics["uncalibrated"]["log_loss"],
            "calibrated_log_loss": metrics["isotonic_calibrated"]["log_loss"],
            "uncalibrated_accuracy": metrics["uncalibrated"]["accuracy"],
            "calibrated_accuracy": metrics["isotonic_calibrated"]["accuracy"],
            "poisson_1x2_accuracy": metrics["independent_poisson_1x2_accuracy"],
            "dixon_coles_1x2_accuracy": metrics["dixon_coles_1x2_accuracy"],
            "majority_baseline_accuracy": metrics["majority_baseline_accuracy"],
        },
    }, indent=2))


if __name__ == "__main__":
    main()
