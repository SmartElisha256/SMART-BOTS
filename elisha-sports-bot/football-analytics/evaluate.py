"""Chronological holdout evaluation with baselines."""
import argparse
import json

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
)
from sklearn.preprocessing import LabelEncoder

from features import FEATURES, load_matches, build_training_frame


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    args = parser.parse_args()

    raw = load_matches(args.data)
    frame = build_training_frame(raw)
    if len(frame) < 50:
        raise ValueError("At least 50 matches are required.")

    split = max(40, int(len(frame) * 0.8))
    if split >= len(frame):
        split = len(frame) - 1

    X = frame[list(FEATURES)].astype(float)
    y = frame["result"].astype(str)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    encoder = LabelEncoder().fit(["A", "D", "H"])
    clf = HistGradientBoostingClassifier(
        max_depth=5, learning_rate=0.06, max_iter=300, min_samples_leaf=20,
        l2_regularization=0.1, random_state=42,
    )
    clf.fit(X_train, encoder.transform(y_train))
    pred = encoder.inverse_transform(clf.predict(X_test))
    proba = clf.predict_proba(X_test)

    dummy = DummyClassifier(strategy="most_frequent")
    dummy.fit(X_train, y_train)
    dummy_pred = dummy.predict(X_test)

    home_m = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=42
    )
    away_m = HistGradientBoostingRegressor(
        max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=43
    )
    home_m.fit(X_train, frame["home_goals"].iloc[:split])
    away_m.fit(X_train, frame["away_goals"].iloc[:split])

    max_p = proba.max(axis=1)
    mask = max_p >= 0.50
    selective_acc = float(accuracy_score(y_test[mask], pred[mask])) if mask.sum() else None

    report = {
        "matches": len(frame),
        "train_matches": int(len(X_train)),
        "test_matches": int(len(X_test)),
        "result_classes_order": list(encoder.classes_),
        "model": {
            "accuracy": float(accuracy_score(y_test, pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
            "macro_f1": float(f1_score(y_test, pred, average="macro", labels=["A", "D", "H"])),
            "log_loss": float(log_loss(y_test, proba, labels=list(encoder.classes_))),
            "confusion_matrix_rows_actual_cols_predicted": confusion_matrix(
                y_test, pred, labels=["A", "D", "H"]
            ).tolist(),
            "selective_tip_threshold": 0.50,
            "selective_tip_count": int(mask.sum()),
            "selective_tip_accuracy": selective_acc,
        },
        "majority_baseline": {
            "most_common_training_class": str(y_train.value_counts().idxmax()),
            "accuracy": float(accuracy_score(y_test, dummy_pred)),
        },
        "goals": {
            "home_goals_mae": float(mean_absolute_error(frame["home_goals"].iloc[split:], home_m.predict(X_test))),
            "away_goals_mae": float(mean_absolute_error(frame["away_goals"].iloc[split:], away_m.predict(X_test))),
        },
        "validation": "chronological holdout; test rows occur after training rows",
        "synthetic_data": bool("source" in raw.columns and (raw["source"] == "synthetic").all()),
        "warning": "Single holdout is not a guarantee of future performance.",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
