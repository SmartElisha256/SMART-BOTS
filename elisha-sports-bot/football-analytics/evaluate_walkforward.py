"""Season-style walk-forward evaluation; every fold trains only on earlier dates."""
from __future__ import annotations

import argparse
import json

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, balanced_accuracy_score, log_loss, mean_absolute_error
from sklearn.preprocessing import LabelEncoder

from features import FEATURES, load_matches, build_training_frame
from evaluation_metrics import assert_strictly_chronological, date_range, multiclass_brier_score, top_label_calibration


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--min-train", type=int, default=380)
    args = parser.parse_args()
    if args.min_train < 1:
        parser.error("--min-train must be positive")

    raw = load_matches(args.data)
    if "source" in raw.columns and raw["source"].astype(str).str.lower().eq("synthetic").any():
        raise SystemExit("Refusing to report real-world evaluation on synthetic-only data.")
    frame = build_training_frame(raw).sort_values("match_date", kind="stable").reset_index(drop=True)
    frame["season_key"] = frame["match_date"].apply(
        lambda ts: f"{ts.year}-{ts.year+1}" if ts.month >= 8 else f"{ts.year-1}-{ts.year}"
    )
    encoder = LabelEncoder().fit(["A", "D", "H"])
    folds = []

    for season in sorted(frame["season_key"].unique()):
        test = frame[frame["season_key"] == season].copy()
        if test.empty:
            continue
        first_test_day = test["match_date"].min().normalize()
        train = frame[frame["match_date"].dt.normalize() < first_test_day].copy()
        if len(train) < args.min_train or len(test) < 50:
            continue
        assert_strictly_chronological(train["match_date"], test["match_date"])
        X_train, X_test = train[list(FEATURES)].astype(float), test[list(FEATURES)].astype(float)
        y_train, y_test = train["result"].astype(str), test["result"].astype(str)

        clf = HistGradientBoostingClassifier(
            max_depth=5, learning_rate=0.06, max_iter=300, min_samples_leaf=20,
            l2_regularization=0.1, random_state=42,
        )
        clf.fit(X_train, encoder.transform(y_train))
        proba = clf.predict_proba(X_test)
        pred = encoder.inverse_transform(clf.predict(X_test))
        majority = DummyClassifier(strategy="most_frequent").fit(X_train, y_train)
        baseline_pred = majority.predict(X_test)

        home_m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=42)
        away_m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=43)
        home_m.fit(X_train, train["home_goals"])
        away_m.fit(X_train, train["away_goals"])
        confidence_mask = proba.max(axis=1) >= 0.50
        folds.append({
            "season": season,
            "train_matches": int(len(train)),
            "test_matches": int(len(test)),
            "train_date_range": date_range(train["match_date"]),
            "test_date_range": date_range(test["match_date"]),
            "accuracy": float(accuracy_score(y_test, pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
            "log_loss": float(log_loss(y_test, proba, labels=list(encoder.classes_))),
            "multiclass_brier_score": multiclass_brier_score(y_test, proba, encoder.classes_),
            "top_label_calibration_bins": top_label_calibration(y_test, proba, pred),
            "majority_baseline": {
                "training_class": str(y_train.value_counts().idxmax()),
                "accuracy": float(accuracy_score(y_test, baseline_pred)),
                "balanced_accuracy": float(balanced_accuracy_score(y_test, baseline_pred)),
            },
            "home_goals_mae": float(mean_absolute_error(test["home_goals"], home_m.predict(X_test))),
            "away_goals_mae": float(mean_absolute_error(test["away_goals"], away_m.predict(X_test))),
            "selective_050_count": int(confidence_mask.sum()),
            "selective_050_accuracy": float(accuracy_score(y_test[confidence_mask], pred[confidence_mask])) if confidence_mask.any() else None,
        })

    if not folds:
        raise SystemExit("No walk-forward folds produced; report unavailable metrics and add sufficient real historical seasons or adjust --min-train.")
    total_test = sum(f["test_matches"] for f in folds)
    weighted = lambda key: sum(f[key] * f["test_matches"] for f in folds) / total_test
    report = {
        "folds": folds,
        "fold_count": len(folds),
        "total_test_matches": total_test,
        "weighted_average_accuracy": weighted("accuracy"),
        "weighted_average_balanced_accuracy": weighted("balanced_accuracy"),
        "weighted_average_log_loss": weighted("log_loss"),
        "weighted_average_multiclass_brier_score": weighted("multiclass_brier_score"),
        "weighted_average_home_goals_mae": weighted("home_goals_mae"),
        "weighted_average_away_goals_mae": weighted("away_goals_mae"),
        "weighted_average_majority_baseline_accuracy": sum(f["majority_baseline"]["accuracy"] * f["test_matches"] for f in folds) / total_test,
        "validation": "each fold trains strictly before its first test date; test seasons are never used to tune that fold",
        "synthetic_data": False,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
