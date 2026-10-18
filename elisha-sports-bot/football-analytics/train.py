"""Train baseline models, evaluate chronological holdout, and save artifacts."""
from __future__ import annotations
import argparse, json
from pathlib import Path
import joblib
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.preprocessing import LabelEncoder
from features import FEATURES, load_matches, build_training_frame

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()
    raw = load_matches(args.data)
    frame = build_training_frame(raw)
    if len(frame) < 20:
        raise ValueError("At least 20 completed matches are required for a cautious baseline.")
    X = frame[list(FEATURES)].astype(float)
    y = frame["result"]
    split = max(15, int(len(frame) * 0.8))
    if split >= len(frame): split = len(frame) - 1
    encoder = LabelEncoder().fit(["A", "D", "H"])
    classifier = RandomForestClassifier(n_estimators=200, min_samples_leaf=3, random_state=42, class_weight="balanced")
    home_model = RandomForestRegressor(n_estimators=160, min_samples_leaf=3, random_state=42)
    away_model = RandomForestRegressor(n_estimators=160, min_samples_leaf=3, random_state=43)
    classifier.fit(X.iloc[:split], encoder.transform(y.iloc[:split]))
    home_model.fit(X.iloc[:split], frame["home_goals"].iloc[:split])
    away_model.fit(X.iloc[:split], frame["away_goals"].iloc[:split])
    holdout = X.iloc[split:]
    metrics = {"holdout_matches": int(len(holdout)),
               "result_accuracy": float(accuracy_score(y.iloc[split:], encoder.inverse_transform(classifier.predict(holdout)))),
               "home_goals_mae": float(mean_absolute_error(frame["home_goals"].iloc[split:], home_model.predict(holdout))),
               "away_goals_mae": float(mean_absolute_error(frame["away_goals"].iloc[split:], away_model.predict(holdout)))}
    classifier.fit(X, encoder.transform(y))
    home_model.fit(X, frame["home_goals"])
    away_model.fit(X, frame["away_goals"])
    out = Path(args.models_dir); out.mkdir(parents=True, exist_ok=True)
    trained_until = raw["match_date"].max().isoformat()
    synthetic_data = bool("source" in raw and (raw["source"] == "synthetic").all())
    joblib.dump({"model": classifier, "encoder": encoder, "features": list(FEATURES),
                 "trained_until": trained_until, "synthetic_data": synthetic_data,
                 "data_path": str(Path(args.data)), "feature_version": "rolling-stats-v4"}, out / "result.joblib")
    joblib.dump(home_model, out / "home_goals.joblib")
    joblib.dump(away_model, out / "away_goals.joblib")
    (out / "evaluation.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(json.dumps({"trained_matches": len(frame), "synthetic_data": synthetic_data,
                      "data_path": str(Path(args.data)), "trained_until": trained_until,
                      "feature_count": len(FEATURES), "features": list(FEATURES), "evaluation": metrics}, indent=2))

if __name__ == "__main__": main()
