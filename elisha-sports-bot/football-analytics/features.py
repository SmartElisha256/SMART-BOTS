"""Leakage-safe football features: form, venue form, Elo, H2H, match stats."""
from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
import pandas as pd

REQUIRED = ("match_date", "home_team", "away_team", "home_goals", "away_goals")
STAT_METRICS = ("shots", "shots_on_target", "corners", "fouls", "yellow_cards", "red_cards")
ELO_START = 1500.0
ELO_K = 20.0
ELO_HOME_ADV = 60.0

FEATURES = (
    "home_form_points", "away_form_points",
    "home_home_form_points", "away_away_form_points",
    "home_goals_for_avg", "home_goals_against_avg",
    "away_goals_for_avg", "away_goals_against_avg",
    "home_matches_seen", "away_matches_seen",
    "home_days_rest", "away_days_rest",
    "home_matches_14d", "away_matches_14d",
    "home_elo", "away_elo", "elo_diff",
    "h2h_home_wins", "h2h_draws", "h2h_away_wins", "h2h_matches",
    "h2h_home_goals_avg", "h2h_away_goals_avg",
    *(name for metric in STAT_METRICS for name in (
        f"home_{metric}_avg", f"away_{metric}_avg",
        f"home_{metric}_coverage", f"away_{metric}_coverage",
    )),
)

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
    # Treat a UTC calendar day and case-insensitive team names as the fixture
    # identity so timestamp/capitalization variants cannot bypass duplicate checks.
    duplicate_key = pd.DataFrame({
        "match_day": df["match_date"].dt.normalize(),
        "home_team_key": df["home_team"].str.casefold(),
        "away_team_key": df["away_team"].str.casefold(),
    })
    if duplicate_key.duplicated().any():
        raise DataQualityError("Duplicate fixtures found (same calendar date and teams, ignoring case).")
    return df.sort_values("match_date", kind="stable").reset_index(drop=True)


def _elo_expected(rating_a: float, rating_b: float) -> float:
    return 1.0 / (1.0 + 10 ** ((rating_b - rating_a) / 400.0))


def _elo_update(r_home: float, r_away: float, hg: int, ag: int) -> tuple[float, float]:
    exp_home = _elo_expected(r_home + ELO_HOME_ADV, r_away)
    if hg > ag:
        score_home = 1.0
    elif hg < ag:
        score_home = 0.0
    else:
        score_home = 0.5
    new_home = r_home + ELO_K * (score_home - exp_home)
    new_away = r_away + ELO_K * ((1.0 - score_home) - (1.0 - exp_home))
    return new_home, new_away


def _team_stats(recent: list) -> dict:
    if not recent:
        return {"for": 0.0, "against": 0.0, "points": 0.0, "count": 0,
                "last_date": None, "metrics": {}, "dates": []}
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
        "dates": [item["date"] for item in recent],
    }


def _matches_in_window(dates: list, match_date, days: int = 14) -> float:
    if match_date is None or not dates:
        return 0.0
    count = 0
    for d in dates:
        delta = (match_date - d).total_seconds() / 86400.0
        if 0 < delta <= days:
            count += 1
    return float(count)


def _record(row, is_home: bool, points: int) -> dict:
    metrics = {}
    mapping = {
        "shots": ("home_shots", "away_shots"),
        "shots_on_target": ("home_shots_on_target", "away_shots_on_target"),
        "corners": ("home_corners", "away_corners"),
        "fouls": ("home_fouls", "away_fouls"),
        "yellow_cards": ("home_yellow_cards", "away_yellow_cards"),
        "red_cards": ("home_red_cards", "away_red_cards"),
    }
    for metric in STAT_METRICS:
        col = mapping[metric][0 if is_home else 1]
        val = getattr(row, col, None) if hasattr(row, col) else None
        if val is None and hasattr(row, "_asdict"):
            val = row._asdict().get(col)
        try:
            metrics[metric] = float(val) if val is not None and pd.notna(val) else None
        except (TypeError, ValueError):
            metrics[metric] = None
    gf = int(row.home_goals if is_home else row.away_goals)
    ga = int(row.away_goals if is_home else row.home_goals)
    return {"date": row.match_date, "gf": gf, "ga": ga, "points": points, "metrics": metrics}


def _h2h_stats(pair_history: list, home: str) -> dict:
    if not pair_history:
        return {
            "h2h_home_wins": 0.0, "h2h_draws": 0.0, "h2h_away_wins": 0.0,
            "h2h_matches": 0.0, "h2h_home_goals_avg": 0.0, "h2h_away_goals_avg": 0.0,
        }
    hw = dr = aw = 0
    hg_sum = ag_sum = 0
    for item in pair_history:
        if item["home"] == home:
            h_goals, a_goals = item["hg"], item["ag"]
        else:
            h_goals, a_goals = item["ag"], item["hg"]
        hg_sum += h_goals
        ag_sum += a_goals
        if h_goals > a_goals:
            hw += 1
        elif h_goals < a_goals:
            aw += 1
        else:
            dr += 1
    n = len(pair_history)
    return {
        "h2h_home_wins": float(hw),
        "h2h_draws": float(dr),
        "h2h_away_wins": float(aw),
        "h2h_matches": float(n),
        "h2h_home_goals_avg": hg_sum / n,
        "h2h_away_goals_avg": ag_sum / n,
    }


def _features_for(home, away, history, home_hist, away_hist, elo, h2h, match_date=None):
    h = _team_stats(list(history[home]))
    a = _team_stats(list(history[away]))
    hh = _team_stats(list(home_hist[home]))
    aa = _team_stats(list(away_hist[away]))

    def rest_days(stats):
        if stats["last_date"] is None or match_date is None:
            return 0.0
        return float(max(0, min(60, (match_date - stats["last_date"]).total_seconds() / 86400)))

    r_home = elo.get(home, ELO_START)
    r_away = elo.get(away, ELO_START)
    pair_key = tuple(sorted([home.casefold(), away.casefold()]))
    h2h_feats = _h2h_stats(list(h2h[pair_key]), home)

    result = {
        "home_form_points": h["points"],
        "away_form_points": a["points"],
        "home_home_form_points": hh["points"],
        "away_away_form_points": aa["points"],
        "home_goals_for_avg": h["for"],
        "home_goals_against_avg": h["against"],
        "away_goals_for_avg": a["for"],
        "away_goals_against_avg": a["against"],
        "home_matches_seen": float(h["count"]),
        "away_matches_seen": float(a["count"]),
        "home_days_rest": rest_days(h),
        "away_days_rest": rest_days(a),
        "home_matches_14d": _matches_in_window(h["dates"], match_date, 14),
        "away_matches_14d": _matches_in_window(a["dates"], match_date, 14),
        "home_elo": r_home,
        "away_elo": r_away,
        "elo_diff": r_home - r_away,
        **h2h_feats,
    }
    for metric in STAT_METRICS:
        result[f"home_{metric}_avg"], result[f"home_{metric}_coverage"] = h["metrics"].get(metric, (0.0, 0))
        result[f"away_{metric}_avg"], result[f"away_{metric}_coverage"] = a["metrics"].get(metric, (0.0, 0))
    return result


def build_training_frame(df: pd.DataFrame, window: int = 5) -> pd.DataFrame:
    history = defaultdict(lambda: deque(maxlen=window))
    home_hist = defaultdict(lambda: deque(maxlen=window))
    away_hist = defaultdict(lambda: deque(maxlen=window))
    elo = {}
    h2h = defaultdict(lambda: deque(maxlen=8))
    rows = []
    ordered = df.sort_values("match_date", kind="stable")

    for _, same_date in ordered.groupby("match_date", sort=True):
        updates = []
        for row in same_date.itertuples(index=False):
            home, away = row.home_team, row.away_team
            features = _features_for(home, away, history, home_hist, away_hist, elo, h2h, row.match_date)
            hg, ag = int(row.home_goals), int(row.away_goals)
            features.update({
                "match_date": row.match_date,
                "home_team": home,
                "away_team": away,
                "home_goals": hg,
                "away_goals": ag,
                "result": "H" if hg > ag else ("A" if hg < ag else "D"),
                "total_goals": hg + ag,
                "btts": int(hg > 0 and ag > 0),
            })
            rows.append(features)
            hp = 3 if hg > ag else (1 if hg == ag else 0)
            ap = 3 if ag > hg else (1 if ag == hg else 0)
            updates.append((home, away, hg, ag, _record(row, True, hp), _record(row, False, ap)))

        for home, away, hg, ag, home_record, away_record in updates:
            history[home].append(home_record)
            history[away].append(away_record)
            home_hist[home].append(home_record)
            away_hist[away].append(away_record)
            r_h = elo.get(home, ELO_START)
            r_a = elo.get(away, ELO_START)
            elo[home], elo[away] = _elo_update(r_h, r_a, hg, ag)
            pair_key = tuple(sorted([home.casefold(), away.casefold()]))
            h2h[pair_key].append({"home": home, "away": away, "hg": hg, "ag": ag})

    return pd.DataFrame(rows)


def features_for_fixture(df, home, away, kickoff=None, window=5):
    cutoff = pd.to_datetime(kickoff, utc=True) if kickoff else pd.Timestamp.now(tz="UTC")
    past = df[df["match_date"] < cutoff].sort_values("match_date", kind="stable")
    if past.empty:
        past = df.sort_values("match_date", kind="stable").iloc[0:0]

    history = defaultdict(lambda: deque(maxlen=window))
    home_hist = defaultdict(lambda: deque(maxlen=window))
    away_hist = defaultdict(lambda: deque(maxlen=window))
    elo = {}
    h2h = defaultdict(lambda: deque(maxlen=8))

    for _, same_date in past.groupby("match_date", sort=True):
        updates = []
        for row in same_date.itertuples(index=False):
            hg, ag = int(row.home_goals), int(row.away_goals)
            hp = 3 if hg > ag else (1 if hg == ag else 0)
            ap = 3 if ag > hg else (1 if ag == hg else 0)
            updates.append((row.home_team, row.away_team, hg, ag, _record(row, True, hp), _record(row, False, ap)))
        for h_team, a_team, hg, ag, home_record, away_record in updates:
            history[h_team].append(home_record)
            history[a_team].append(away_record)
            home_hist[h_team].append(home_record)
            away_hist[a_team].append(away_record)
            r_h = elo.get(h_team, ELO_START)
            r_a = elo.get(a_team, ELO_START)
            elo[h_team], elo[a_team] = _elo_update(r_h, r_a, hg, ag)
            pair_key = tuple(sorted([h_team.casefold(), a_team.casefold()]))
            h2h[pair_key].append({"home": h_team, "away": a_team, "hg": hg, "ag": ag})

    return _features_for(home, away, history, home_hist, away_hist, elo, h2h, cutoff)


def team_form(df, team, as_of=None, limit=5):
    cutoff = pd.to_datetime(as_of, utc=True) if as_of else pd.Timestamp.now(tz="UTC")
    past = df[(df["match_date"] < cutoff) & ((df["home_team"] == team) | (df["away_team"] == team))]
    past = past.sort_values("match_date").tail(limit)
    matches = []
    points = goals_for = goals_against = 0
    for row in past.itertuples(index=False):
        is_home = row.home_team == team
        gf, ga = (int(row.home_goals), int(row.away_goals)) if is_home else (int(row.away_goals), int(row.home_goals))
        pts = 3 if gf > ga else (1 if gf == ga else 0)
        points += pts
        goals_for += gf
        goals_against += ga
        matches.append({
            "date": row.match_date.isoformat(),
            "opponent": row.away_team if is_home else row.home_team,
            "venue": "home" if is_home else "away",
            "goals_for": gf,
            "goals_against": ga,
            "points": pts,
        })
    return {
        "team": team,
        "matches_used": len(matches),
        "points": points,
        "goals_for": goals_for,
        "goals_against": goals_against,
        "recent_matches": matches,
    }
