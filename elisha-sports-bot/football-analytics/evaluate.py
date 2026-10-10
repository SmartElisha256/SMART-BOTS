"""Chronological holdout evaluation for the baseline models."""
import argparse, json
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error
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
    encoder = LabelEncoder().fit(["A", "D", "H"])
    model = RandomForestClassifier(n_estimators=160, min_samples_leaf=2, random_state=42, class_weight="balanced")
    model.fit(X.iloc[:split], encoder.transform(frame["result"].iloc[:split]))
    predicted = encoder.inverse_transform(model.predict(X.iloc[split:]))
    home = RandomForestRegressor(n_estimators=120, min_samples_leaf=2, random_state=42)
    away = RandomForestRegressor(n_estimators=120, min_samples_leaf=2, random_state=43)
    home.fit(X.iloc[:split], frame["home_goals"].iloc[:split])
    away.fit(X.iloc[:split], frame["away_goals"].iloc[:split])
    report = {
        "matches": int(len(frame)), "train_matches": int(split), "test_matches": int(len(frame) - split),
        "result_accuracy": float(accuracy_score(frame["result"].iloc[split:], predicted)),
        "home_goals_mae": float(mean_absolute_error(frame["home_goals"].iloc[split:], home.predict(X.iloc[split:]))),
        "away_goals_mae": float(mean_absolute_error(frame["away_goals"].iloc[split:], away.predict(X.iloc[split:]))),
        "validation": "chronological holdout; test rows occur after training rows",
        "synthetic_data": bool("source" in raw and (raw["source"] == "synthetic").all()),
        "warning": "Synthetic-data metrics are pipeline checks, not evidence of real-world performance."
    }
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    main()
