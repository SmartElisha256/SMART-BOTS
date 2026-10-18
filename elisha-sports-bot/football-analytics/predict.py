"""Generate pre-match estimates from trained models and historical match data."""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict, deque
from pathlib import Path
import joblib
import numpy as np
from features import FEATURES, load_matches, team_form, _features_for, _record, STAT_METRICS

def poisson_pmf(k: int, rate: float) -> float:
    rate = max(0.0, min(float(rate), 20.0))
    return math.exp(-rate) * rate ** k / math.factorial(k)

def _normalise(values: dict[str, float]) -> dict[str, float]:
    total = sum(values.values())
    if total <= 0: raise ValueError("Could not calculate a valid probability distribution.")
    return {key: max(0.0, value) / total for key, value in values.items()}

def predict(payload: dict, data_path="data/epl_historical.csv", models_dir="models") -> dict:
    if not isinstance(payload, dict): raise ValueError("Request body must be a JSON object.")
    home, away = payload.get("home_team"), payload.get("away_team")
    if not isinstance(home, str) or not home.strip() or len(home.strip()) > 80:
        raise ValueError("home_team must be a non-empty string of at most 80 characters.")
    if not isinstance(away, str) or not away.strip() or len(away.strip()) > 80:
        raise ValueError("away_team must be a non-empty string of at most 80 characters.")
    home, away = home.strip(), away.strip()
    if home.casefold() == away.casefold(): raise ValueError("home_team and away_team must be different.")
    kickoff = payload.get("kickoff")
    if kickoff is not None and not isinstance(kickoff, str): raise ValueError("kickoff must be an ISO date/time string or null.")
    try: cutoff = np.datetime64(kickoff.replace("Z", "")) if kickoff else None
    except Exception as exc: raise ValueError("kickoff must be a valid ISO date/time.") from exc

    raw = load_matches(data_path)
    if cutoff is not None: raw = raw[raw["match_date"].dt.tz_convert(None) < cutoff]
    if len(raw) < 20: raise ValueError("At least 20 historical matches before kickoff are required.")
    models = Path(models_dir)
    needed = [models / "result.joblib", models / "home_goals.joblib", models / "away_goals.joblib"]
    if not all(path.exists() for path in needed):
        raise FileNotFoundError("Models are not trained. Run prepare_epl_data.py, then train.py --data data/epl_historical.csv")
    result_artifact = joblib.load(needed[0])
    home_model, away_model = joblib.load(needed[1]), joblib.load(needed[2])
    if cutoff is not None and result_artifact.get("trained_until"):
        model_cutoff = np.datetime64(str(result_artifact["trained_until"]).replace("Z", ""))
        if cutoff <= model_cutoff:
            raise ValueError("Model artifacts include matches on or after the requested kickoff. Retrain using history strictly before that kickoff for historical backtesting.")

    history = defaultdict(lambda: deque(maxlen=5))
    for row in raw.sort_values("match_date").itertuples(index=False):
        hp = 3 if row.home_goals > row.away_goals else (1 if row.home_goals == row.away_goals else 0)
        ap = 3 if row.away_goals > row.home_goals else (1 if row.away_goals == row.home_goals else 0)
        history[row.home_team].append(_record(row, True, hp))
        history[row.away_team].append(_record(row, False, ap))
    features = _features_for(home, away, history, raw["match_date"].max() + pd.Timedelta(days=1))
    X = [[float(features[name]) for name in FEATURES]]

    classifier = result_artifact["model"]
    encoded = classifier.predict_proba(X)[0]
    labels = result_artifact["encoder"].inverse_transform(classifier.classes_)
    ml_probs = _normalise({str(label): float(prob) for label, prob in zip(labels, encoded)})
    ml_result = _normalise({"home_win": ml_probs.get("H", 0.0), "draw": ml_probs.get("D", 0.0), "away_win": ml_probs.get("A", 0.0)})
    home_xg = max(0.05, min(6.0, float(home_model.predict(X)[0])))
    away_xg = max(0.05, min(6.0, float(away_model.predict(X)[0])))
    home_pmf = [poisson_pmf(k, home_xg) for k in range(21)]
    away_pmf = [poisson_pmf(k, away_xg) for k in range(21)]
    scores, outcomes = [], {"home_win": 0.0, "draw": 0.0, "away_win": 0.0}
    for hg, hp in enumerate(home_pmf):
        for ag, ap in enumerate(away_pmf):
            probability = hp * ap
            outcomes["home_win" if hg > ag else "away_win" if hg < ag else "draw"] += probability
            if hg <= 10 and ag <= 10: scores.append({"score": f"{hg}-{ag}", "probability": probability})
    result_probs = _normalise(outcomes)
    scores.sort(key=lambda item: item["probability"], reverse=True)
    goal_lines, total_xg = {}, home_xg + away_xg
    for line in (0.5, 1.5, 2.5, 3.5):
        under = min(1.0, max(0.0, sum(poisson_pmf(k, total_xg) for k in range(int(line) + 1))))
        goal_lines[f"over_{str(line).replace('.', '_')}"] = 1.0 - under
        goal_lines[f"under_{str(line).replace('.', '_')}"] = under
    btts_yes = (1.0 - math.exp(-home_xg)) * (1.0 - math.exp(-away_xg))
    is_synthetic = bool(result_artifact.get("synthetic_data", False) or ("source" in raw and (raw["source"] == "synthetic").all()))
    available_stats = [column for column in raw.columns if column in {
        "home_shots", "away_shots", "home_shots_on_target", "away_shots_on_target",
        "home_corners", "away_corners", "home_fouls", "away_fouls",
        "home_yellow_cards", "away_yellow_cards", "home_red_cards", "away_red_cards"}]
    stat_coverage = {column: int(raw[column].notna().sum()) for column in available_stats}
    warnings = [
        "Synthetic sample data is not evidence of real-world accuracy." if is_synthetic else "Historical model is not independently validated on current-season fixtures.",
        "Player injuries, confirmed lineups, suspensions, and live news are not model features; they are checked separately by the match-context layer when a data source is available.",
        "Current-season/live statistics are not silently substituted for missing historical data.",
        "Predictions are estimates, not guarantees.",
    ]
    return {
        "fixture": {"home_team": home, "away_team": away, "competition": payload.get("competition"), "kickoff": kickoff},
        "data_quality": {"status": "synthetic" if is_synthetic else ("limited" if len(raw) < 100 else "unvalidated"),
                         "historical_matches": int(len(raw)), "history_date_range": {"from": str(raw["match_date"].min().date()), "to": str(raw["match_date"].max().date())},
                         "historical_stat_coverage": stat_coverage, "warnings": warnings},
        "features_used": {"model_features": list(FEATURES), "rolling_window_matches": 5, "player_data_in_model": False},
        "match_result": result_probs, "machine_learning_result": ml_result,
        "double_chance": {"1X": result_probs["home_win"] + result_probs["draw"], "X2": result_probs["draw"] + result_probs["away_win"], "12": result_probs["home_win"] + result_probs["away_win"]},
        "goal_markets": goal_lines, "btts": {"yes": float(btts_yes), "no": float(1.0 - btts_yes)},
        "expected_goals": {"home": home_xg, "away": away_xg},
        "correct_score": scores[:5],
        "team_form": {"home": team_form(raw, home, as_of=kickoff), "away": team_form(raw, away, as_of=kickoff)},
        "confidence": {"level": "unvalidated" if is_synthetic or len(raw) < 100 else "limited",
                       "top_result_probability": max(result_probs.values()),
                       "warnings": ["Confidence labels are conservative and are not calibrated performance guarantees."]},
        "model": {"version": "baseline-random-forest-rolling-stats-poisson-v4",
                  "trained_until": result_artifact.get("trained_until", str(raw["match_date"].max())),
                  "evaluation_summary": (models / "evaluation.json").read_text() if (models / "evaluation.json").exists() else None},
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-stdin", action="store_true")
    parser.add_argument("--data", default="data/epl_historical.csv")
    parser.add_argument("--models-dir", default="models")
    parser.add_argument("--home-team"); parser.add_argument("--away-team"); parser.add_argument("--kickoff")
    args = parser.parse_args()
    try:
        payload = json.load(sys.stdin) if args.request_stdin else {"home_team": args.home_team, "away_team": args.away_team, "kickoff": args.kickoff}
        print(json.dumps(predict(payload, args.data, args.models_dir), allow_nan=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)})); sys.exit(1)

if __name__ == "__main__":
    import pandas as pd
    main()
