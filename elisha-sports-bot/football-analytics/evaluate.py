"""Leakage-aware chronological evaluation with useful classification baselines."""
import argparse
import json

import numpy as np
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
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
    parser.add_argument("--data", default="data/synthetic_matches.csv")
    args = parser.parse_args()

    raw = load_matches(args.data)
    frame = build_training_frame(raw)
    if len(frame) < 20:
        raise ValueError("At least 20 matches are required for chronological evaluation.")

    split = max(15, int(len(frame) * 0.8))
    if split >= len(frame):
        split = len(frame) - 1

    X = frame[list(FEATURES)].astype(float)
    y = frame["result"].astype(str)
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    encoder = LabelEncoder().fit(["A", "D", "H"])
    y_train_encoded = encoder.transform(y_train)
    y_test_encoded = encoder.transform(y_test)

    model = RandomForestClassifier(
        n_estimators=240,
        min_samples_leaf=4,
        max_features=0.8,
        random_state=42,
        class_weight="balanced_subsample",
    )
    model.fit(X_train, y_train_encoded)
    predicted_encoded = model.predict(X_test)
    probabilities = model.predict_proba(X_test)
    predicted = encoder.inverse_transform(predicted_encoded)

    # A majority-class baseline shows whether the model beats a trivial strategy.
    baseline = DummyClassifier(strategy="most_frequent")
    baseline.fit(X_train, y_train)
    baseline_predicted = baseline.predict(X_test)

    home = RandomForestRegressor(
        n_estimators=200, min_samples_leaf=4, random_state=42
    )
    away = RandomForestRegressor(
        n_estimators=200, min_samples_leaf=4, random_state=43
    )
    home.fit(X_train, frame["home_goals"].iloc[:split])
    away.fit(X_train, frame["away_goals"].iloc[:split])

    # Multiclass Brier score: lower is better; ideal is 0.
    one_hot = np.eye(len(encoder.classes_))[y_test_encoded]
    brier = float(np.mean(np.sum((probabilities - one_hot) ** 2, axis=1)))

    report = {
        "matches": int(len(frame)),
        "train_matches": int(split),
        "test_matches": int(len(frame) - split),
        "result_classes_order": encoder.classes_.tolist(),
        "model": {
            "accuracy": float(accuracy_score(y_test, predicted)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, predicted)),
            "macro_f1": float(f1_score(y_test, predicted, labels=encoder.classes_, average="macro", zero_division=0)),
            "log_loss": float(log_loss(y_test_encoded, probabilities, labels=list(range(len(encoder.classes_))))),
            "multiclass_brier_score": brier,
            "confusion_matrix_rows_actual_cols_predicted": confusion_matrix(
                y_test, predicted, labels=encoder.classes_
            ).tolist(),
        },
        "majority_baseline": {
            "most_common_training_class": str(y_train.mode().iloc[0]),
            "accuracy": float(accuracy_score(y_test, baseline_predicted)),
        },
        "goals": {
            "home_goals_mae": float(mean_absolute_error(
                frame["home_goals"].iloc[split:], home.predict(X_test)
            )),
            "away_goals_mae": float(mean_absolute_error(
                frame["away_goals"].iloc[split:], away.predict(X_test)
            )),
        },
        "validation": "chronological holdout; test rows occur after training rows",
        "synthetic_data": bool(
            "source" in raw and (raw["source"] == "synthetic").all()
        ),
        "warning": (
            "Use real historical matches only. This is a single holdout, not a guarantee "
            "of future performance. Compare against the majority baseline; lower log loss "
            "and Brier score are better."
        ),
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
