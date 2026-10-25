"""Derive football markets from an independent Poisson score probability matrix.

All markets here share the same score distribution so probabilities stay consistent.
Classifier-based 1X2 estimates must NOT be mixed into these calculations.

Truncation policy
-----------------
The score grid is expanded until the estimated omitted joint Poisson tail mass is
below a documented tolerance (default 1e-6), capped at 15 goals per side. The matrix
is then normalised so represented cells sum to 1. Probabilities are therefore exact
within the truncated-and-normalised independent-Poisson model, not exact for the
untruncated infinite grid.
"""
from __future__ import annotations

import math
from typing import Any


def _pct(p: float) -> float:
    return round(100.0 * float(p), 2)


def _pmf(k: int, rate: float) -> float:
    rate = max(0.0, min(float(rate), 20.0))
    return math.exp(-rate) * (rate ** k) / math.factorial(k)


def build_poisson_score_matrix(
    home_xg: float,
    away_xg: float,
    *,
    max_goals: int | None = None,
    residual_tol: float = 1e-6,
    max_goals_cap: int = 15,
) -> tuple[dict[tuple[int, int], float], dict[str, Any]]:
    """Build a normalised independent-Poisson score matrix.

    Returns (matrix, meta) where matrix maps (home_goals, away_goals) -> probability
    and meta documents grid size and estimated omitted tail mass before normalisation.
    """
    if not math.isfinite(home_xg) or not math.isfinite(away_xg):
        raise ValueError("expected goals must be finite numbers.")
    if home_xg < 0 or away_xg < 0:
        raise ValueError("expected goals must be non-negative.")

    if max_goals is None:
        max_goals = 7
        residual = 1.0
        while max_goals < max_goals_cap:
            cdf_h = sum(_pmf(k, home_xg) for k in range(0, max_goals + 1))
            cdf_a = sum(_pmf(k, away_xg) for k in range(0, max_goals + 1))
            residual = max(0.0, 1.0 - cdf_h * cdf_a)
            if residual < residual_tol:
                break
            max_goals += 1
    else:
        cdf_h = sum(_pmf(k, home_xg) for k in range(0, max_goals + 1))
        cdf_a = sum(_pmf(k, away_xg) for k in range(0, max_goals + 1))
        residual = max(0.0, 1.0 - cdf_h * cdf_a)

    raw: dict[tuple[int, int], float] = {}
    for h in range(0, max_goals + 1):
        for a in range(0, max_goals + 1):
            raw[(h, a)] = _pmf(h, home_xg) * _pmf(a, away_xg)
    total = sum(raw.values())
    if total <= 0 or not math.isfinite(total):
        raise ValueError("Score matrix has no valid probability mass.")
    normalised = {k: v / total for k, v in raw.items()}
    meta = {
        "max_goals_per_team": max_goals,
        "raw_mass_before_norm": float(total),
        "omitted_tail_mass_estimate": float(residual),
        "residual_tol": residual_tol,
        "approximation": "truncated_independent_poisson_normalised",
        "truncation_note": (
            f"Grid 0–{max_goals} goals/side; estimated omitted joint tail mass "
            f"{residual:.2e} before normalisation (tol {residual_tol}). "
            "Displayed probabilities sum to 1 over the truncated grid only."
        ),
    }
    return normalised, meta


def markets_from_score_matrix(
    score_matrix: dict[tuple[int, int], float],
    home_xg: float,
    away_xg: float,
    *,
    max_goals: int = 7,
    grid_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build market estimates from a normalised score matrix {(h, a): p}."""
    total_mass = sum(score_matrix.values())
    if total_mass <= 0:
        raise ValueError("Score matrix has no probability mass.")
    if abs(total_mass - 1.0) > 1e-6:
        score_matrix = {k: v / total_mass for k, v in score_matrix.items()}

    home_win = draw = away_win = 0.0
    btts_yes = 0.0
    home_cs = away_cs = 0.0
    home_scores = away_scores = 0.0
    home_2plus = away_2plus = 0.0
    total_lines = {0.5: 0.0, 1.5: 0.0, 2.5: 0.0, 3.5: 0.0, 4.5: 0.0, 5.5: 0.0}
    home_team_lines = {0.5: 0.0, 1.5: 0.0, 2.5: 0.0}
    away_team_lines = {0.5: 0.0, 1.5: 0.0, 2.5: 0.0}
    goal_ranges = {"0_1": 0.0, "2_3": 0.0, "4_plus": 0.0}

    for (h, a), p in score_matrix.items():
        if p < 0 or not math.isfinite(p):
            raise ValueError("Score matrix contains invalid probabilities.")
        if h > a:
            home_win += p
        elif h == a:
            draw += p
        else:
            away_win += p
        if h > 0 and a > 0:
            btts_yes += p
        if a == 0:
            home_cs += p
        if h == 0:
            away_cs += p
        if h > 0:
            home_scores += p
        if a > 0:
            away_scores += p
        if h >= 2:
            home_2plus += p
        if a >= 2:
            away_2plus += p
        total = h + a
        for line in total_lines:
            if total > line:
                total_lines[line] += p
        for line in home_team_lines:
            if h > line:
                home_team_lines[line] += p
        for line in away_team_lines:
            if a > line:
                away_team_lines[line] += p
        if total <= 1:
            goal_ranges["0_1"] += p
        elif total <= 3:
            goal_ranges["2_3"] += p
        else:
            goal_ranges["4_plus"] += p

    result = {"home_win": home_win, "draw": draw, "away_win": away_win}
    dnb_den = home_win + away_win
    if dnb_den > 0:
        dnb_home, dnb_away = home_win / dnb_den, away_win / dnb_den
    else:
        dnb_home = dnb_away = 0.5

    goal_markets = {}
    for line, over_p in total_lines.items():
        key = str(line).replace(".", "_")
        goal_markets[f"over_{key}"] = over_p
        goal_markets[f"under_{key}"] = 1.0 - over_p

    home_goals_markets = {}
    away_goals_markets = {}
    for line, over_p in home_team_lines.items():
        key = str(line).replace(".", "_")
        home_goals_markets[f"over_{key}"] = over_p
        home_goals_markets[f"under_{key}"] = 1.0 - over_p
    for line, over_p in away_team_lines.items():
        key = str(line).replace(".", "_")
        away_goals_markets[f"over_{key}"] = over_p
        away_goals_markets[f"under_{key}"] = 1.0 - over_p

    scores = sorted(
        [{"home": h, "away": a, "probability": float(p)} for (h, a), p in score_matrix.items()],
        key=lambda item: item["probability"],
        reverse=True,
    )
    top_note = (
        "The top correct-score rank is the mode of the truncated Poisson grid; "
        "its probability is usually far below 50% and is not a high-certainty pick."
    )

    meta = {
        "source": "independent_poisson_score_matrix",
        "max_goals_per_team": max_goals,
        "matrix_cells": len(score_matrix),
        "truncation_note": (
            f"Score grid 0–{max_goals} goals per team; residual mass beyond the grid "
            "is estimated before normalisation (see omitted_tail_mass_estimate)."
        ),
        "top_score_note": top_note,
    }
    if grid_meta:
        meta.update(grid_meta)

    return {
        "match_result": result,
        "double_chance": {
            "1X": home_win + draw,
            "X2": draw + away_win,
            "12": home_win + away_win,
        },
        "draw_no_bet": {
            "home": dnb_home,
            "away": dnb_away,
            "push_probability": draw,
            "note": "If the match draws, a draw-no-bet selection is a push (stake returned). "
            "Home/away probabilities are renormalised excluding draws.",
        },
        "goal_markets": goal_markets,
        "home_team_goals": home_goals_markets,
        "away_team_goals": away_goals_markets,
        "goal_ranges": goal_ranges,
        "btts": {"yes": btts_yes, "no": 1.0 - btts_yes},
        "team_scoring": {
            "home_scores": home_scores,
            "away_scores": away_scores,
            "home_clean_sheet": home_cs,
            "away_clean_sheet": away_cs,
            "home_two_or_more": home_2plus,
            "away_two_or_more": away_2plus,
        },
        "expected_goals": {
            "home": float(home_xg),
            "away": float(away_xg),
            "total": float(home_xg + away_xg),
        },
        "correct_score": scores[:8],
        "correct_score_note": top_note,
        "half_time": {
            "available": False,
            "reason": "No first-half score model or HT historical labels are trained in this pipeline.",
        },
        "first_team_to_score": {
            "available": False,
            "reason": "Requires a temporal scoring model; not derived from full-time Poisson scores alone.",
        },
        "meta": meta,
    }


def market_rows_for_display(markets: dict[str, Any]) -> list[dict[str, Any]]:
    """Flatten key markets into percentage rows for WhatsApp / API consumers."""
    mr = markets["match_result"]
    rows = [
        {"market": "1X2", "outcome": "Home win", "probability_pct": _pct(mr["home_win"]), "source": "poisson"},
        {"market": "1X2", "outcome": "Draw", "probability_pct": _pct(mr["draw"]), "source": "poisson"},
        {"market": "1X2", "outcome": "Away win", "probability_pct": _pct(mr["away_win"]), "source": "poisson"},
        {"market": "Double chance", "outcome": "1X", "probability_pct": _pct(markets["double_chance"]["1X"]), "source": "poisson"},
        {"market": "Double chance", "outcome": "X2", "probability_pct": _pct(markets["double_chance"]["X2"]), "source": "poisson"},
        {"market": "Double chance", "outcome": "12", "probability_pct": _pct(markets["double_chance"]["12"]), "source": "poisson"},
        {"market": "Draw no bet", "outcome": "Home", "probability_pct": _pct(markets["draw_no_bet"]["home"]), "source": "poisson"},
        {"market": "Draw no bet", "outcome": "Away", "probability_pct": _pct(markets["draw_no_bet"]["away"]), "source": "poisson"},
    ]
    gm = markets["goal_markets"]
    for line in ("0_5", "1_5", "2_5", "3_5", "4_5", "5_5"):
        rows.append({"market": "Total goals", "outcome": f"Over {line.replace('_', '.')}", "probability_pct": _pct(gm[f"over_{line}"]), "source": "poisson"})
        rows.append({"market": "Total goals", "outcome": f"Under {line.replace('_', '.')}", "probability_pct": _pct(gm[f"under_{line}"]), "source": "poisson"})
    rows.append({"market": "BTTS", "outcome": "Yes", "probability_pct": _pct(markets["btts"]["yes"]), "source": "poisson"})
    rows.append({"market": "BTTS", "outcome": "No", "probability_pct": _pct(markets["btts"]["no"]), "source": "poisson"})
    ts = markets["team_scoring"]
    rows.append({"market": "Team", "outcome": "Home scores", "probability_pct": _pct(ts["home_scores"]), "source": "poisson"})
    rows.append({"market": "Team", "outcome": "Away scores", "probability_pct": _pct(ts["away_scores"]), "source": "poisson"})
    rows.append({"market": "Team", "outcome": "Home clean sheet", "probability_pct": _pct(ts["home_clean_sheet"]), "source": "poisson"})
    rows.append({"market": "Team", "outcome": "Away clean sheet", "probability_pct": _pct(ts["away_clean_sheet"]), "source": "poisson"})
    return rows
