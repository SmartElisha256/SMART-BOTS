"""Audit historical football CSV quality and summarize a team's recent form.

This utility reports data quality and historical statistics only. It does not
produce betting recommendations or wagering probabilities.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

REQUIRED = ("match_date", "home_team", "away_team", "home_goals", "away_goals")


def audit_matches(path: str | Path, team: str | None = None, as_of: str | None = None, limit: int = 5) -> dict:
    source_path = Path(path)
    raw = pd.read_csv(source_path)
    missing_columns = [column for column in REQUIRED if column not in raw.columns]
    if missing_columns:
        return {
            "file": str(source_path),
            "status": "invalid",
            "missing_columns": missing_columns,
            "rows_read": int(len(raw)),
        }

    df = raw.copy()
    original_count = len(df)
    dates = pd.to_datetime(df["match_date"], errors="coerce", utc=True)
    home = df["home_team"].astype("string").str.strip()
    away = df["away_team"].astype("string").str.strip()
    hg = pd.to_numeric(df["home_goals"], errors="coerce")
    ag = pd.to_numeric(df["away_goals"], errors="coerce")

    invalid_date = dates.isna()
    blank_team = home.isna() | away.isna() | home.eq("") | away.eq("")
    invalid_score = hg.isna() | ag.isna() | hg.lt(0) | ag.lt(0) | hg.mod(1).ne(0) | ag.mod(1).ne(0)
    self_fixture = home.str.casefold().eq(away.str.casefold()).fillna(False)
    duplicate_keys = pd.DataFrame({
        "match_date": dates,
        "home_team": home.str.casefold(),
        "away_team": away.str.casefold(),
    }).duplicated(keep=False)
    invalid = invalid_date | blank_team | invalid_score | self_fixture | duplicate_keys

    valid = pd.DataFrame({
        "match_date": dates,
        "home_team": home,
        "away_team": away,
        "home_goals": hg,
        "away_goals": ag,
    }).loc[~invalid].copy()
    valid["home_goals"] = valid["home_goals"].astype(int)
    valid["away_goals"] = valid["away_goals"].astype(int)
    valid = valid.sort_values("match_date", kind="stable")

    source_label = "unknown"
    if "source" in raw.columns:
        labels = raw["source"].dropna().astype(str).str.strip().str.lower().unique().tolist()
        if labels and all(label == "synthetic" for label in labels):
            source_label = "synthetic"
        elif labels:
            source_label = "labelled: " + ", ".join(sorted(labels))
    elif "epl" in source_path.name.lower() or "historical" in source_path.name.lower():
        source_label = "unverified filename label; inspect provenance"

    report = {
        "file": str(source_path),
        "source_assessment": source_label,
        "rows_read": int(original_count),
        "valid_rows": int(len(valid)),
        "invalid_rows": int(invalid.sum()),
        "issues": {
            "invalid_dates": int(invalid_date.sum()),
            "blank_team_names": int(blank_team.sum()),
            "invalid_or_missing_scores": int(invalid_score.sum()),
            "self_fixtures": int(self_fixture.sum()),
            "rows_in_duplicate_fixture_groups": int(duplicate_keys.sum()),
        },
        "date_range": {
            "first": valid["match_date"].min().date().isoformat() if len(valid) else None,
            "last": valid["match_date"].max().date().isoformat() if len(valid) else None,
        },
        "warning": "A filename or source column is not proof of authenticity; verify the original provider and licensing.",
    }

    if team:
        cutoff = pd.to_datetime(as_of, utc=True) if as_of else pd.Timestamp.now(tz="UTC")
        folded = team.strip().casefold()
        team_matches = valid.loc[
            (valid["match_date"] < cutoff)
            & (
                valid["home_team"].str.casefold().eq(folded)
                | valid["away_team"].str.casefold().eq(folded)
            )
        ].tail(limit)
        matches = []
        points = gf = ga = wins = draws = losses = 0
        for row in team_matches.itertuples(index=False):
            is_home = row.home_team.casefold() == folded
            scored = row.home_goals if is_home else row.away_goals
            conceded = row.away_goals if is_home else row.home_goals
            result = "W" if scored > conceded else ("D" if scored == conceded else "L")
            points += 3 if result == "W" else (1 if result == "D" else 0)
            gf += scored
            ga += conceded
            wins += result == "W"
            draws += result == "D"
            losses += result == "L"
            matches.append({
                "date": row.match_date.date().isoformat(),
                "opponent": row.away_team if is_home else row.home_team,
                "venue": "home" if is_home else "away",
                "score": f"{row.home_goals}-{row.away_goals}",
                "result": result,
            })
        report["team_form"] = {
            "team": team.strip(),
            "as_of_exclusive": cutoff.isoformat(),
            "matches_included": len(matches),
            "matches": matches,
            "record": {"wins": int(wins), "draws": int(draws), "losses": int(losses)},
            "points": int(points),
            "goals_for": int(gf),
            "goals_against": int(ga),
        }
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="Path to a historical match CSV")
    parser.add_argument("--team", help="Optional team name for a recent form summary")
    parser.add_argument("--as-of", help="Optional cutoff date/time; matches on or after it are excluded")
    parser.add_argument("--limit", type=int, default=5, help="Number of latest matches for team form (default: 5)")
    args = parser.parse_args()
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    print(json.dumps(audit_matches(args.data, args.team, args.as_of, args.limit), indent=2))


if __name__ == "__main__":
    main()
