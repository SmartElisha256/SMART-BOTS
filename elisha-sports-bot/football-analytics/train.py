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

MODEL_VERSION = "hgb-elo-h2h-venue-v5"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    args = parser.parse_args()

    raw = load_matches(args.data)
    if "source" in raw.columns and (raw["source"] == "synthetic").all():
        raise SystemExit("Refusing to train on synthetic-only data. Use real season CSVs.")

    frame = build_training_frame(raw)
    if len(frame) < 50:
        raise ValueError("At least 50 completed matches are required.")

    X = frame[list(FEATURES)].astype(float)
    y = frame["result"].astype(str)
    split = max(40, int(len(frame) * 0.8))
    if split >= len(frame):
        split = len(frame) - 1

    encoder = LabelEncoder().fit(["A", "D", "H"])
    y_enc = encoder.transform(y)

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

    classifier.fit(X.iloc[:split], y_enc[:split])
    home_model.fit(X.iloc[:split], frame["home_goals"].iloc[:split])
    away_model.fit(X.iloc[:split], frame["away_goals"].iloc[:split])

    holdout_X = X.iloc[split:]
    holdout_y = y.iloc[split:]
    pred = encoder.inverse_transform(classifier.predict(holdout_X))
    proba = classifier.predict_proba(holdout_X)
    metrics = {
        "holdout_matches": int(len(holdout_X)),
        "result_accuracy": float(accuracy_score(holdout_y, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(holdout_y, pred)),
        "log_loss": float(log_loss(holdout_y, proba, labels=list(encoder.classes_))),
        "home_goals_mae": float(mean_absolute_error(frame["home_goals"].iloc[split:], home_model.predict(holdout_X))),
        "away_goals_mae": float(mean_absolute_error(frame["away_goals"].iloc[split:], away_model.predict(holdout_X))),
        "majority_baseline": float((holdout_y == holdout_y.value_counts().idxmax()).mean()) if len(holdout_y) else 0.0,
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
