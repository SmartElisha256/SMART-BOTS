"""Resolve prediction_logs against finished matches."""
from __future__ import annotations

import argparse
import pandas as pd


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--results", default="data/epl_historical.csv")
    parser.add_argument("--out", default="resolved_predictions.csv")
    args = parser.parse_args()

    preds = pd.read_csv(args.predictions)
    results = pd.read_csv(args.results)
    results["match_date"] = pd.to_datetime(results["match_date"], utc=True, errors="coerce")

    rows = []
    hits = 0
    for row in preds.itertuples(index=False):
        home = str(getattr(row, "home_team", "")).strip()
        away = str(getattr(row, "away_team", "")).strip()
        match = results[
            (results["home_team"].str.casefold() == home.casefold())
            & (results["away_team"].str.casefold() == away.casefold())
        ]
        if match.empty:
            rows.append({**row._asdict(), "actual_1x2": None, "hit": None})
            continue
        m = match.sort_values("match_date").iloc[-1]
        hg, ag = int(m["home_goals"]), int(m["away_goals"])
        actual = "home" if hg > ag else ("away" if hg < ag else "draw")
        predicted = str(getattr(row, "predicted_1x2", "") or "").lower()
        if predicted in ("h", "home_win"):
            predicted = "home"
        elif predicted in ("a", "away_win"):
            predicted = "away"
        elif predicted in ("d",):
            predicted = "draw"
        hit = predicted == actual
        hits += int(hit)
        rows.append({**row._asdict(), "actual_1x2": actual, "actual_home_goals": hg, "actual_away_goals": ag, "hit": hit})

    out = pd.DataFrame(rows)
    out.to_csv(args.out, index=False)
    resolved = out["hit"].notna().sum()
    print(f"Resolved {resolved}/{len(out)}; hits={hits}; accuracy={(hits/resolved if resolved else 0):.3f}")


if __name__ == "__main__":
    main()
