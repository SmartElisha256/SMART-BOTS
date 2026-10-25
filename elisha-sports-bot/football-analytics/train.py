"""Train improved models on real historical matches (no synthetic)."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, balanced_accuracy_score, log_loss, mean_absolute_error
from sklearn.preprocessing import LabelEncoder

from features import FEATURES, load_matches, build_training_frame
from evaluation_metrics import assert_strictly_chronological, date_range, multiclass_brier_score, top_label_calibration

MODEL_VERSION = "hgb-elo-h2h-venue-v5"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()

    raw = load_matches(args.data)
    if "source" in raw.columns and raw["source"].astype(str).str.lower().eq("synthetic").any():
        raise SystemExit("Refusing to train on synthetic-only data. Use real season CSVs.")

    frame = build_training_frame(raw).sort_values("match_date", kind="stable").reset_index(drop=True)
    if len(frame) < 50:
        raise ValueError("At least 50 completed matches are required.")

    proposed_split = max(40, int(len(frame) * 0.8))
    if proposed_split >= len(frame):
        proposed_split = len(frame) - 1
    cutoff = frame.iloc[proposed_split]["match_date"]
    train_frame = frame[frame["match_date"] < cutoff].copy()
    holdout_frame = frame[frame["match_date"] >= cutoff].copy()
    if len(train_frame) < 40 or holdout_frame.empty:
        raise ValueError("Insufficient data after enforcing a strict date-based holdout.")
    assert_strictly_chronological(train_frame["match_date"], holdout_frame["match_date"])

    X_train = train_frame[list(FEATURES)].astype(float)
    X_holdout = holdout_frame[list(FEATURES)].astype(float)
    y_train = train_frame["result"].astype(str)
    y_holdout = holdout_frame["result"].astype(str)
    X = frame[list(FEATURES)].astype(float)
    y = frame["result"].astype(str)
    encoder = LabelEncoder().fit(["A", "D", "H"])
    y_enc = encoder.transform(y)
    y_train_enc = encoder.transform(y_train)

    classifier = HistGradientBoostingClassifier(
        max_depth=5,
        learning_rate=0.06,
        max_iter=300,
        min_samples_leaf=20,
        l2_regularization=0.1,
        random_state=42,
    )
    home_model = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=42
    )
    away_model = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=43
    )

    classifier.fit(X_train, y_train_enc)
    home_model.fit(X_train, train_frame["home_goals"])
    away_model.fit(X_train, train_frame["away_goals"])

    pred = encoder.inverse_transform(classifier.predict(X_holdout))
    proba = classifier.predict_proba(X_holdout)
    baseline_class = y_train.value_counts().idxmax()
    baseline_pred = [baseline_class] * len(y_holdout)
    metrics = {
        "train_matches": int(len(train_frame)),
        "holdout_matches": int(len(holdout_frame)),
        "train_date_range": date_range(train_frame["match_date"]),
        "holdout_date_range": date_range(holdout_frame["match_date"]),
        "result_accuracy": float(accuracy_score(y_holdout, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(y_holdout, pred)),
        "log_loss": float(log_loss(y_holdout, proba, labels=list(encoder.classes_))),
        "multiclass_brier_score": multiclass_brier_score(y_holdout, proba, encoder.classes_),
        "top_label_calibration_bins": top_label_calibration(y_holdout, proba, pred),
        "home_goals_mae": float(mean_absolute_error(holdout_frame["home_goals"], home_model.predict(X_holdout))),
        "away_goals_mae": float(mean_absolute_error(holdout_frame["away_goals"], away_model.predict(X_holdout))),
        "majority_baseline_class_from_training": str(baseline_class),
        "majority_baseline_accuracy": float(accuracy_score(y_holdout, baseline_pred)),
        "evaluation_note": "Chronological holdout metrics are computed before final refit; they are not an independent test after this model is refit on all rows.",
    }

    classifier.fit(X, y_enc)
    home_model.fit(X, frame["home_goals"])
    away_model.fit(X, frame["away_goals"])

    out = Path(args.models_dir)
    out.mkdir(parents=True, exist_ok=True)
    trained_until = raw["match_date"].max().isoformat()
    synthetic_data = bool("source" in raw.columns and (raw["source"] == "synthetic").all())

    joblib.dump(
        {
            "model": classifier,
            "encoder": encoder,
            "features": list(FEATURES),
            "trained_until": trained_until,
            "synthetic_data": synthetic_data,
            "data_path": str(Path(args.data)),
            "feature_version": "elo-h2h-venue-v5",
            "model_version": MODEL_VERSION,
        },
        out / "result.joblib",
    )
    joblib.dump(home_model, out / "home_goals.joblib")
    joblib.dump(away_model, out / "away_goals.joblib")
    (out / "evaluation.json").write_text(json.dumps(metrics, indent=2) + "\n")

    print(json.dumps({
        "trained_matches": len(frame),
        "synthetic_data": synthetic_data,
        "data_path": str(Path(args.data)),
        "trained_until": trained_until,
        "model_version": MODEL_VERSION,
        "feature_count": len(FEATURES),
        "evaluation": metrics,
    }, indent=2))


if __name__ == "__main__":
    main()
