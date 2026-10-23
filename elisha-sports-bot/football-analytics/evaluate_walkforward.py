"""Season-style walk-forward evaluation (leakage-safe)."""
from __future__ import annotations

import argparse
import json

from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import accuracy_score, balanced_accuracy_score, log_loss
from sklearn.preprocessing import LabelEncoder

from features import FEATURES, load_matches, build_training_frame


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--min-train", type=int, default=380)
    args = parser.parse_args()

    raw = load_matches(args.data)
    frame = build_training_frame(raw)
    frame["season_key"] = frame["match_date"].apply(
        lambda ts: f"{ts.year}-{ts.year+1}" if ts.month >= 8 else f"{ts.year-1}-{ts.year}"
    )

    seasons = sorted(frame["season_key"].unique())
    folds = []
    encoder = LabelEncoder().fit(["A", "D", "H"])

    for season in seasons:
        test = frame[frame["season_key"] == season]
        train = frame[frame["match_date"] < test["match_date"].min()]
        if len(train) < args.min_train or len(test) < 50:
            continue
        X_train = train[list(FEATURES)].astype(float)
        y_train = train["result"].astype(str)
        X_test = test[list(FEATURES)].astype(float)
        y_test = test["result"].astype(str)

        clf = HistGradientBoostingClassifier(
            max_depth=5, learning_rate=0.06, max_iter=300, min_samples_leaf=20,
            l2_regularization=0.1, random_state=42,
        )
        clf.fit(X_train, encoder.transform(y_train))
        pred = encoder.inverse_transform(clf.predict(X_test))
        proba = clf.predict_proba(X_test)
        majority = y_train.value_counts().idxmax()
        mask = proba.max(axis=1) >= 0.50
        folds.append({
            "season": season,
            "train_matches": len(train),
            "test_matches": len(test),
            "accuracy": float(accuracy_score(y_test, pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
            "log_loss": float(log_loss(y_test, proba, labels=list(encoder.classes_))),
            "majority_baseline": float((y_test == majority).mean()),
            "selective_050_count": int(mask.sum()),
            "selective_050_accuracy": float(accuracy_score(y_test[mask], pred[mask])) if mask.any() else None,
        })

    if not folds:
        raise SystemExit("No walk-forward folds produced; need more seasons or lower --min-train.")

    avg_acc = sum(f["accuracy"] for f in folds) / len(folds)
    avg_base = sum(f["majority_baseline"] for f in folds) / len(folds)
    print(json.dumps({
        "folds": folds,
        "average_accuracy": avg_acc,
        "average_majority_baseline": avg_base,
        "lift_vs_baseline": avg_acc - avg_base,
        "validation": "walk-forward by season; train only on matches before test season",
    }, indent=2))


if __name__ == "__main__":
    main()
