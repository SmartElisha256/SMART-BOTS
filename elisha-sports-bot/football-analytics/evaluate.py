"""Chronological holdout evaluation with baselines and probability diagnostics."""
import argparse
import json

from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, balanced_accuracy_score, confusion_matrix, f1_score, log_loss, mean_absolute_error
from sklearn.preprocessing import LabelEncoder

from features import FEATURES, load_matches, build_training_frame
from evaluation_metrics import assert_strictly_chronological, date_range, multiclass_brier_score, top_label_calibration


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    args = parser.parse_args()

    raw = load_matches(args.data)
    if "source" in raw.columns and raw["source"].astype(str).str.lower().eq("synthetic").any():
        raise SystemExit("Refusing to report real-world evaluation on synthetic-only data.")
    frame = build_training_frame(raw).sort_values("match_date", kind="stable").reset_index(drop=True)
    if len(frame) < 50:
        raise ValueError("At least 50 matches are required.")

    proposed_split = max(40, int(len(frame) * 0.8))
    if proposed_split >= len(frame):
        proposed_split = len(frame) - 1
    cutoff = frame.iloc[proposed_split]["match_date"]
    train = frame[frame["match_date"] < cutoff].copy()
    test = frame[frame["match_date"] >= cutoff].copy()
    if len(train) < 40 or len(test) < 1:
        raise ValueError("Insufficient data after enforcing a strict date-based holdout.")
    assert_strictly_chronological(train["match_date"], test["match_date"])

    X_train, X_test = train[list(FEATURES)].astype(float), test[list(FEATURES)].astype(float)
    y_train, y_test = train["result"].astype(str), test["result"].astype(str)
    encoder = LabelEncoder().fit(["A", "D", "H"])
    clf = HistGradientBoostingClassifier(
        max_depth=5, learning_rate=0.06, max_iter=300, min_samples_leaf=20,
        l2_regularization=0.1, random_state=42,
    )
    clf.fit(X_train, encoder.transform(y_train))
    proba = clf.predict_proba(X_test)
    pred = encoder.inverse_transform(clf.predict(X_test))

    dummy = DummyClassifier(strategy="most_frequent").fit(X_train, y_train)
    dummy_pred = dummy.predict(X_test)
    home_m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=42)
    away_m = HistGradientBoostingRegressor(max_depth=4, learning_rate=0.06, max_iter=250, min_samples_leaf=20, random_state=43)
    home_m.fit(X_train, train["home_goals"])
    away_m.fit(X_train, train["away_goals"])

    max_p = proba.max(axis=1)
    mask = max_p >= 0.50
    selective_acc = float(accuracy_score(y_test[mask], pred[mask])) if mask.sum() else None
    report = {
        "matches": int(len(frame)),
        "train_matches": int(len(train)),
        "test_matches": int(len(test)),
        "train_date_range": date_range(train["match_date"]),
        "test_date_range": date_range(test["match_date"]),
        "result_classes_order": list(encoder.classes_),
        "model": {
            "accuracy": float(accuracy_score(y_test, pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
            "macro_f1": float(f1_score(y_test, pred, average="macro", labels=["A", "D", "H"], zero_division=0)),
            "log_loss": float(log_loss(y_test, proba, labels=list(encoder.classes_))),
            "multiclass_brier_score": multiclass_brier_score(y_test, proba, encoder.classes_),
            "top_label_calibration_bins": top_label_calibration(y_test, proba, pred),
            "confusion_matrix_rows_actual_cols_predicted": confusion_matrix(y_test, pred, labels=["A", "D", "H"]).tolist(),
            "selective_confidence_threshold": 0.50,
            "selective_match_count": int(mask.sum()),
            "selective_accuracy": selective_acc,
        },
        "majority_baseline": {
            "most_common_training_class": str(y_train.value_counts().idxmax()),
            "accuracy": float(accuracy_score(y_test, dummy_pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, dummy_pred)),
        },
        "goals": {
            "home_goals_mae": float(mean_absolute_error(test["home_goals"], home_m.predict(X_test))),
            "away_goals_mae": float(mean_absolute_error(test["away_goals"], away_m.predict(X_test))),
        },
        "validation": "strict date-based holdout; every training date is earlier than every test date",
        "synthetic_data": False,
        "interpretation": "One chronological holdout is diagnostic, not an independent guarantee of future performance.",
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
