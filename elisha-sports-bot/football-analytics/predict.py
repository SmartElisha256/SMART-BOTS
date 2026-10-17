"""Generate a fixture prediction from trained artifacts and validated history."""
from __future__ import annotations
import argparse, json, math, sys
from pathlib import Path
import numpy as np
import joblib
from features import FEATURES, load_matches, team_form, _features_for
from collections import defaultdict, deque

def poisson_pmf(k: int, rate: float) -> float:
    rate = max(0.0, min(float(rate), 20.0))
    return math.exp(-rate) * rate ** k / math.factorial(k)

def predict(payload: dict, data_path="data/synthetic_matches.csv", models_dir="models") -> dict:
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
    try:
        cutoff = np.datetime64(kickoff.replace("Z", "")) if kickoff else None
    except Exception as exc:
        raise ValueError("kickoff must be a valid ISO date/time.") from exc
    raw = load_matches(data_path)
    if cutoff is not None:
        raw = raw[raw["match_date"].dt.tz_convert(None) < cutoff]
    if len(raw) < 20:
        raise ValueError("At least 20 historical matches before kickoff are required.")
    models = Path(models_dir)
    needed = [models / "result.joblib", models / "home_goals.joblib", models / "away_goals.joblib"]
    if not all(path.exists() for path in needed):
        raise FileNotFoundError("Models are not trained. Run: python train.py --data data/synthetic_matches.csv")
    result_artifact = joblib.load(needed[0])
    home_model, away_model = joblib.load(needed[1]), joblib.load(needed[2])
    if cutoff is not None and result_artifact.get("trained_until"):
        model_cutoff = np.datetime64(str(result_artifact["trained_until"]).replace("Z", ""))
        if cutoff <= model_cutoff:
            raise ValueError(
                "Model artifacts include matches on or after the requested kickoff. "
                "Retrain using history strictly before that kickoff for historical backtesting."
            )
    history = defaultdict(lambda: deque(maxlen=5))
    for row in raw.sort_values("match_date").itertuples(index=False):
        hg, ag = int(row.home_goals), int(row.away_goals)
        history[row.home_team].append((hg, ag, 3 if hg > ag else (1 if hg == ag else 0)))
        history[row.away_team].append((ag, hg, 3 if ag > hg else (1 if ag == hg else 0)))
    feats = _features_for(home, away, history)
    X = [[float(feats[name]) for name in FEATURES]]
    artifact = result_artifact
    encoded = artifact["model"].predict_proba(X)[0]
    labels = artifact["encoder"].inverse_transform(artifact["model"].classes_)
    result_probs = {str(label): float(prob) for label, prob in zip(labels, encoded)}
    result_probs = {label: max(0.0, result_probs.get(label, 0.0)) for label in ("H", "D", "A")}
    total = sum(result_probs.values())
    if total <= 0:
        raise ValueError("Model returned an invalid match-result probability distribution.")
    result_probs = {k: v / total for k, v in result_probs.items()}
    home_xg = max(0.05, min(6.0, float(home_model.predict(X)[0])))
    away_xg = max(0.05, min(6.0, float(away_model.predict(X)[0])))
    home_pmf = [poisson_pmf(k, home_xg) for k in range(10)]
    away_pmf = [poisson_pmf(k, away_xg) for k in range(10)]
    scores = []
    for hg in range(8):
        for ag in range(8):
            scores.append({"score": f"{hg}-{ag}", "probability": home_pmf[hg] * away_pmf[ag]})
    scores.sort(key=lambda item: item["probability"], reverse=True)
    goal_lines = {}
    total_xg = home_xg + away_xg
    for line in (0.5, 1.5, 2.5, 3.5):
        # Sum goals are Poisson-distributed with rate home_xg + away_xg.
        # Compute the lower tail directly so omitted high-score outcomes are included.
        under = sum(poisson_pmf(k, total_xg) for k in range(int(line) + 1))
        over = max(0.0, min(1.0, 1.0 - under))
        goal_lines[f"over_{str(line).replace('.', '_')}"] = float(over)
        goal_lines[f"under_{str(line).replace('.', '_')}"] = float(under)
    btts_yes = (1.0 - math.exp(-home_xg)) * (1.0 - math.exp(-away_xg))
    is_synthetic = bool(result_artifact.get("synthetic_data", False) or ("source" in raw and (raw["source"] == "synthetic").all()))
    result = {
      "fixture": {"home_team": home, "away_team": away, "competition": payload.get("competition"), "kickoff": kickoff},
      "data_quality": {"status": "synthetic" if is_synthetic else ("limited" if len(raw) < 100 else "unvalidated"),
        "historical_matches": int(len(raw)), "warnings": [
        "Synthetic sample data is not evidence of real-world accuracy." if is_synthetic else "Model has not been independently validated on live competition data.",
        "Predictions are estimates, not guarantees."]},
      "match_result": {"home_win": result_probs["H"], "draw": result_probs["D"], "away_win": result_probs["A"]},
      "double_chance": {"1X": result_probs["H"] + result_probs["D"], "X2": result_probs["D"] + result_probs["A"], "12": result_probs["H"] + result_probs["A"]},
      "goal_markets": goal_lines,
      "btts": {"yes": float(btts_yes), "no": float(1.0 - btts_yes)},
      "expected_goals": {"home": home_xg, "away": away_xg},
      "correct_score": scores[:5],
      "team_form": {"home": team_form(raw, home, as_of=kickoff), "away": team_form(raw, away, as_of=kickoff)},
      "confidence": {"level": "unvalidated" if is_synthetic or len(raw) < 100 else "limited", "top_result_probability": max(result_probs.values()),
                     "warnings": ["Confidence labels are conservative and are not calibrated performance guarantees."]},
      "model": {"version": "baseline-random-forest-poisson-v2", "trained_until": result_artifact.get("trained_until", str(raw["match_date"].max())),
                "evaluation_summary": str((models / "evaluation.json").read_text()) if (models / "evaluation.json").exists() else None}
    }
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--request-stdin", action="store_true")
    parser.add_argument("--data", default="data/synthetic_matches.csv")
    parser.add_argument("--models-dir", default="models")
    parser.add_argument("--home-team")
    parser.add_argument("--away-team")
    parser.add_argument("--kickoff")
    args = parser.parse_args()
    try:
        payload = json.load(sys.stdin) if args.request_stdin else {"home_team": args.home_team, "away_team": args.away_team, "kickoff": args.kickoff}
        print(json.dumps(predict(payload, args.data, args.models_dir), allow_nan=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
