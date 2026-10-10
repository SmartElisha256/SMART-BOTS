"""Leakage-safe football feature engineering and match-data validation."""
from __future__ import annotations

from collections import defaultdict, deque
from datetime import date
from pathlib import Path
import pandas as pd

REQUIRED = ("match_date", "home_team", "away_team", "home_goals", "away_goals")
FEATURES = (
    "home_form_points", "away_form_points",
    "home_goals_for_avg", "home_goals_against_avg",
    "away_goals_for_avg", "away_goals_against_avg",
    "home_matches_seen", "away_matches_seen",
)

class DataQualityError(ValueError):
    """Raised when match data is incomplete or inconsistent."""

def load_matches(path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = [column for column in REQUIRED if column not in df.columns]
    if missing:
        raise DataQualityError(f"Missing required columns: {', '.join(missing)}")
    df = df.copy()
    df["match_date"] = pd.to_datetime(df["match_date"], errors="coerce", utc=True)
    if df["match_date"].isna().any():
        raise DataQualityError("One or more match_date values are invalid.")
    for col in ("home_team", "away_team"):
        if not df[col].map(lambda x: isinstance(x, str) and bool(x.strip())).all():
            raise DataQualityError(f"{col} contains a missing or blank team name.")
        df[col] = df[col].str.strip()
        if df[col].str.len().gt(80).any():
            raise DataQualityError(f"{col} contains an excessively long team name.")
    if (df["home_team"].str.casefold() == df["away_team"].str.casefold()).any():
        raise DataQualityError("A team cannot play itself.")
    for col in ("home_goals", "away_goals"):
        numeric = pd.to_numeric(df[col], errors="coerce")
        if numeric.isna().any() or (numeric < 0).any() or (numeric % 1 != 0).any():
            raise DataQualityError(f"{col} must contain non-negative whole numbers.")
        df[col] = numeric.astype(int)
    duplicate_key = ["match_date", "home_team", "away_team"]
    if df.duplicated(duplicate_key).any():
        raise DataQualityError("Duplicate fixtures found (same date and teams).")
    return df.sort_values("match_date", kind="stable").reset_index(drop=True)

def _features_for(home: str, away: str, history: dict) -> dict:
    def stats(team):
        recent = list(history[team])
        if not recent:
            return (0.0, 0.0, 0.0, 0)
        return (
            sum(item[0] for item in recent) / len(recent),
            sum(item[1] for item in recent) / len(recent),
            sum(item[2] for item in recent) / len(recent),
            len(recent),
        )
    h_for, h_against, h_points, h_n = stats(home)
    a_for, a_against, a_points, a_n = stats(away)
    return {
        "home_form_points": h_points, "away_form_points": a_points,
        "home_goals_for_avg": h_for, "home_goals_against_avg": h_against,
        "away_goals_for_avg": a_for, "away_goals_against_avg": a_against,
        "home_matches_seen": h_n, "away_matches_seen": a_n,
    }

def build_training_frame(df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    """Create pre-match features using only earlier results; then update history."""
    history = defaultdict(lambda: deque(maxlen=window))
    rows = []
    ordered = df.sort_values("match_date", kind="stable")
    for row in ordered.itertuples(index=False):
        home, away = row.home_team, row.away_team
        features = _features_for(home, away, history)
        hg, ag = int(row.home_goals), int(row.away_goals)
        features.update({
            "match_date": row.match_date,
            "home_team": home, "away_team": away,
            "home_goals": hg, "away_goals": ag,
            "result": "H" if hg > ag else ("A" if hg < ag else "D"),
            "total_goals": hg + ag,
            "btts": int(hg > 0 and ag > 0),
        })
        rows.append(features)
        hp = 3 if hg > ag else (1 if hg == ag else 0)
        ap = 3 if ag > hg else (1 if ag == hg else 0)
        history[home].append((hg, ag, hp))
        history[away].append((ag, hg, ap))
    return pd.DataFrame(rows)

def team_form(df: pd.DataFrame, team: str, as_of: str | None = None, limit: int = 5) -> dict:
    """Summarize a team's latest completed matches before as_of."""
    cutoff = pd.to_datetime(as_of, utc=True) if as_of else pd.Timestamp.now(tz="UTC")
    past = df[(df["match_date"] < cutoff) & ((df["home_team"] == team) | (df["away_team"] == team))]
    past = past.sort_values("match_date").tail(limit)
    matches = []
    points = goals_for = goals_against = 0
    for row in past.itertuples(index=False):
        is_home = row.home_team == team
        gf, ga = (int(row.home_goals), int(row.away_goals)) if is_home else (int(row.away_goals), int(row.home_goals))
        pts = 3 if gf > ga else (1 if gf == ga else 0)
        points += pts; goals_for += gf; goals_against += ga
        matches.append({"date": row.match_date.isoformat(), "opponent": row.away_team if is_home else row.home_team,
                        "venue": "home" if is_home else "away", "goals_for": gf, "goals_against": ga, "points": pts})
    return {"team": team, "matches_used": len(matches), "points": points,
            "goals_for": goals_for, "goals_against": goals_against, "recent_matches": matches}
