"""Generate pre-match estimates from trained models and historical match data."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from features import FEATURES, features_for_fixture, load_matches, team_form
from markets import markets_from_score_matrix, market_rows_for_display, build_poisson_score_matrix


def poisson_pmf(k: int, rate: float) -> float:
    rate = max(0.0, min(float(rate), 20.0))
    return math.exp(-rate) * rate ** k / math.factorial(k)


def _normalise(values: dict[str, float]) -> dict[str, float]:
    total = sum(values.values())
    if total <= 0:
        raise ValueError("Could not calculate a valid probability distribution.")
    return {key: max(0.0, value) / total for key, value in values.items()}


def _confidence_level(top_prob: float, historical_matches: int, is_synthetic: bool) -> str:
    if is_synthetic:
        return "very_low"
    if historical_matches < 50:
        return "low"
    if top_prob >= 0.55 and historical_matches >= 200:
        return "high"
    if top_prob >= 0.48 and historical_matches >= 100:
        return "medium"
    if top_prob >= 0.42:
        return "limited"
    return "low"


def predict(payload: dict, data_path="data/epl_historical.csv", models_dir="models") -> dict:
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    home, away = payload.get("home_team"), payload.get("away_team")
    if not isinstance(home, str) or not home.strip() or len(home.strip()) > 80:
        raise ValueError("home_team must be a non-empty string of at most 80 characters.")
    if not isinstance(away, str) or not away.strip() or len(away.strip()) > 80:
        raise ValueError("away_team must be a non-empty string of at most 80 characters.")
    home, away = home.strip(), away.strip()
    if home.casefold() == away.casefold():
        raise ValueError("home_team and away_team must be different.")
    kickoff = payload.get("kickoff")
    if kickoff is not None and not isinstance(kickoff, str):
        raise ValueError("kickoff must be an ISO date/time string or null.")

    raw = load_matches(data_path)
    models = Path(models_dir)
    needed = [models / "result.joblib", models / "home_goals.joblib", models / "away_goals.joblib"]
    if not all(path.exists() for path in needed):
        raise FileNotFoundError(
            "Models are not trained. Run prepare_epl_data.py, then train.py --data data/epl_historical.csv"
        )

    result_artifact = joblib.load(needed[0])
    home_model = joblib.load(needed[1])
    away_model = joblib.load(needed[2])
    classifier = result_artifact["model"]
    encoder = result_artifact["encoder"]
    feature_names = list(result_artifact.get("features") or FEATURES)

    feat = features_for_fixture(raw, home, away, kickoff=kickoff)
    X = pd.DataFrame([{name: float(feat.get(name, 0.0)) for name in feature_names}])[feature_names]

    proba = classifier.predict_proba(X)[0]
    classes = list(encoder.classes_)
    class_probs = {cls: float(p) for cls, p in zip(classes, proba)}
    ml_result = _normalise({
        "home_win": class_probs.get("H", 0.0),
        "draw": class_probs.get("D", 0.0),
        "away_win": class_probs.get("A", 0.0),
    })
    ml_result["predicted_label"] = max(
        ("home_win", "draw", "away_win"), key=lambda k: ml_result[k]
    )

    home_xg = float(max(0.05, min(5.0, home_model.predict(X)[0])))
    away_xg = float(max(0.05, min(5.0, away_model.predict(X)[0])))

    score_matrix, grid_meta = build_poisson_score_matrix(home_xg, away_xg)
    max_goals = int(grid_meta["max_goals_per_team"])

    markets = markets_from_score_matrix(
        score_matrix, home_xg, away_xg, max_goals=max_goals, grid_meta=grid_meta
    )
    result_probs = markets["match_result"]
    scores = markets["correct_score"]
    goal_lines = markets["goal_markets"]

    is_synthetic = bool(result_artifact.get("synthetic_data"))
    warnings = []
    if kickoff:
        try:
            ko = pd.to_datetime(kickoff, utc=True)
            if ko < pd.Timestamp.now(tz="UTC") - pd.Timedelta(hours=3):
                warnings.append(
                    "Kickoff is in the past relative to server time; this is a historical-style "
                    "estimate using only features available before that kickoff, not a live forecast."
                )
        except Exception:
            warnings.append("Kickoff timestamp could not be parsed; treat timing context as uncertain.")
    if is_synthetic:
        warnings.append("Model was trained on synthetic data.")
    if feat.get("home_matches_seen", 0) < 3 or feat.get("away_matches_seen", 0) < 3:
        warnings.append("Limited form history for one or both teams.")
    if feat.get("h2h_matches", 0) < 1:
        warnings.append("No head-to-head meetings in the training history window.")

    top_prob = max(result_probs.values())
    conf_level = _confidence_level(top_prob, len(raw), is_synthetic)

    return {
        "fixture": {
            "home_team": home,
            "away_team": away,
            "competition": payload.get("competition"),
            "kickoff": kickoff,
        },
        "data_quality": {
            "status": "synthetic" if is_synthetic else ("ok" if len(raw) >= 200 else "limited"),
            "historical_matches": int(len(raw)),
            "history_date_range": {
                "from": str(raw["match_date"].min().date()),
                "to": str(raw["match_date"].max().date()),
            },
            "warnings": warnings,
        },
        "features_used": {
            "model_features": feature_names,
            "rolling_window_matches": 5,
            "player_data_in_model": False,
            "includes_elo": True,
            "includes_h2h": True,
            "includes_venue_form": True,
        },
        "match_result": result_probs,
        "machine_learning_result": ml_result,
        "double_chance": markets["double_chance"],
        "draw_no_bet": markets["draw_no_bet"],
        "goal_markets": goal_lines,
        "home_team_goals": markets["home_team_goals"],
        "away_team_goals": markets["away_team_goals"],
        "goal_ranges": markets["goal_ranges"],
        "btts": markets["btts"],
        "team_scoring": markets["team_scoring"],
        "expected_goals": markets["expected_goals"],
        "correct_score": scores[:8],
        "correct_score_note": markets.get("correct_score_note"),
        "half_time": markets["half_time"],
        "first_team_to_score": markets["first_team_to_score"],
        "market_rows": market_rows_for_display(markets),
        "markets_meta": markets["meta"],
        "team_form": {
            "home": team_form(raw, home, as_of=kickoff),
            "away": team_form(raw, away, as_of=kickoff),
        },
        "confidence": {
            "level": conf_level,
            "top_result_probability": top_prob,
            "warnings": [
                "Confidence labels are conservative and are not calibrated performance guarantees."
            ],
        },
        "model": {
            "version": result_artifact.get("model_version", "hgb-elo-h2h-venue-v5"),
            "name": result_artifact.get("model_version", "hgb-elo-h2h-venue-v5"),
            "trained_until": result_artifact.get("trained_until", str(raw["match_date"].max())),
            "evaluation_summary": (models / "evaluation.json").read_text()
            if (models / "evaluation.json").exists()
            else None,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-stdin", action="store_true")
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    parser.add_argument("--home-team")
    parser.add_argument("--away-team")
    parser.add_argument("--kickoff")
    args = parser.parse_args()
    try:
        payload = (
            json.load(sys.stdin)
            if args.request_stdin
            else {"home_team": args.home_team, "away_team": args.away_team, "kickoff": args.kickoff}
        )
        print(json.dumps(predict(payload, args.data, args.models_dir), allow_nan=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
