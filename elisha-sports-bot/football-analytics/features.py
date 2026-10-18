"""Leakage-safe football features from historical results and match statistics."""
from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
import pandas as pd

REQUIRED = ("match_date", "home_team", "away_team", "home_goals", "away_goals")
STAT_METRICS = ("shots", "shots_on_target", "corners", "fouls", "yellow_cards", "red_cards")
FEATURES = (
    "home_form_points", "away_form_points",
    "home_goals_for_avg", "home_goals_against_avg",
    "away_goals_for_avg", "away_goals_against_avg",
    "home_matches_seen", "away_matches_seen",
    "home_days_rest", "away_days_rest",
    *(name for metric in STAT_METRICS for name in (
        f"home_{metric}_avg", f"away_{metric}_avg",
        f"home_{metric}_coverage", f"away_{metric}_coverage",
    )),
)

# Normalized optional columns supplied by football-data.co.uk season files.
OPTIONAL_STATS = (
    "home_shots", "away_shots", "home_shots_on_target", "away_shots_on_target",
    "home_corners", "away_corners", "home_fouls", "away_fouls",
    "home_yellow_cards", "away_yellow_cards", "home_red_cards", "away_red_cards",
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
    for col in OPTIONAL_STATS:
        if col in df.columns:
            numeric = pd.to_numeric(df[col], errors="coerce")
            if (numeric.dropna() < 0).any():
                raise DataQualityError(f"{col} cannot contain negative statistics.")
            df[col] = numeric
    duplicate_key = ["match_date", "home_team", "away_team"]
    if df.duplicated(duplicate_key).any():
        raise DataQualityError("Duplicate fixtures found (same date and teams).")
    return df.sort_values("match_date", kind="stable").reset_index(drop=True)

def _team_stats(team: str, history: dict) -> dict:
    recent = list(history[team])
    if not recent:
        return {"for": 0.0, "against": 0.0, "points": 0.0, "count": 0,
                "last_date": None, "metrics": {}}
    metric_values = {}
    for metric in STAT_METRICS:
        values = [item["metrics"][metric] for item in recent if item["metrics"].get(metric) is not None]
        metric_values[metric] = (sum(values) / len(values), len(values)) if values else (0.0, 0)
    return {
        "for": sum(item["gf"] for item in recent) / len(recent),
        "against": sum(item["ga"] for item in recent) / len(recent),
        "points": sum(item["points"] for item in recent) / len(recent),
        "count": len(recent),
        "last_date": recent[-1]["date"],
        "metrics": metric_values,
    }

def _features_for(home: str, away: str, history: dict, match_date=None) -> dict:
    h, a = _team_stats(home, history), _team_stats(away, history)
    def rest_days(stats):
        if stats["last_date"] is None or match_date is None:
            return 0.0
        return float(max(0, min(60, (match_date - stats["last_date"]).total_seconds() / 86400)))
    result = {
        "home_form_points": h["points"], "away_form_points": a["points"],
        "home_goals_for_avg": h["for"], "home_goals_against_avg": h["against"],
        "away_goals_for_avg": a["for"], "away_goals_against_avg": a["against"],
        "home_matches_seen": h["count"], "away_matches_seen": a["count"],
        "home_days_rest": rest_days(h), "away_days_rest": rest_days(a),
    }
    for metric in STAT_METRICS:
        result[f"home_{metric}_avg"], result[f"home_{metric}_coverage"] = h["metrics"].get(metric, (0.0, 0))
        result[f"away_{metric}_avg"], result[f"away_{metric}_coverage"] = a["metrics"].get(metric, (0.0, 0))
    return result

def _record(row, is_home: bool, points: int) -> dict:
    metrics = {}
    for metric in STAT_METRICS:
        column = f"{'home' if is_home else 'away'}_{metric}"
        value = getattr(row, column, None)
        metrics[metric] = float(value) if value is not None and pd.notna(value) else None
    return {
        "gf": int(row.home_goals if is_home else row.away_goals),
        "ga": int(row.away_goals if is_home else row.home_goals),
        "points": points,
        "date": row.match_date,
        "metrics": metrics,
    }

def build_training_frame(df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    """Create features from strictly earlier dates; update history only after each date group."""
    history = defaultdict(lambda: deque(maxlen=window))
    rows = []
    ordered = df.sort_values("match_date", kind="stable")
    # Same-day fixtures share pre-date history because kickoff ordering is unknown.
    for _, same_date in ordered.groupby("match_date", sort=True):
        updates = []
        for row in same_date.itertuples(index=False):
            home, away = row.home_team, row.away_team
            features = _features_for(home, away, history, row.match_date)
            hg, ag = int(row.home_goals), int(row.away_goals)
            features.update({
                "match_date": row.match_date, "home_team": home, "away_team": away,
                "home_goals": hg, "away_goals": ag,
                "result": "H" if hg > ag else ("A" if hg < ag else "D"),
                "total_goals": hg + ag, "btts": int(hg > 0 and ag > 0),
            })
            rows.append(features)
            hp = 3 if hg > ag else (1 if hg == ag else 0)
            ap = 3 if ag > hg else (1 if ag == hg else 0)
            updates.append((home, away, _record(row, True, hp), _record(row, False, ap)))
        for home, away, home_record, away_record in updates:
            history[home].append(home_record)
            history[away].append(away_record)
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
