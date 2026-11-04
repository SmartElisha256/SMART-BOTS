"""Dixon–Coles low-score adjustment on top of an independent Poisson grid.

rho is estimated on a chronological calibration window and saved with the models.
rho = 0 leaves the independent Poisson matrix unchanged.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from markets import _pmf, build_poisson_score_matrix


def dixon_coles_tau(home_goals: int, away_goals: int, home_xg: float, away_xg: float, rho: float) -> float:
    """Dixon–Coles multiplicative adjustment. Independent Poisson when rho is 0."""
    if home_goals == 0 and away_goals == 0:
        return 1.0 - home_xg * away_xg * rho
    if home_goals == 0 and away_goals == 1:
        return 1.0 + home_xg * rho
    if home_goals == 1 and away_goals == 0:
        return 1.0 + away_xg * rho
    if home_goals == 1 and away_goals == 1:
        return 1.0 - rho
    return 1.0


def _validate_rho(rho: float) -> float:
    if isinstance(rho, bool) or not isinstance(rho, (int, float)) or not math.isfinite(rho):
        raise ValueError("Dixon–Coles rho must be a finite number.")
    if rho < -0.2 or rho > 0.2:
        raise ValueError("Dixon–Coles rho must be between -0.2 and 0.2.")
    return float(rho)


def build_dixon_coles_score_matrix(
    home_xg: float,
    away_xg: float,
    rho: float,
    **grid_kwargs: Any,
) -> tuple[dict[tuple[int, int], float], dict[str, Any]]:
    """Poisson grid with a Dixon–Coles tau adjustment, then renormalised."""
    rho = _validate_rho(rho)
    base, meta = build_poisson_score_matrix(home_xg, away_xg, **grid_kwargs)
    if abs(rho) < 1e-12:
        meta = {
            **meta,
            "approximation": "truncated_independent_poisson_normalised",
            "dependence": "independent_poisson",
            "dixon_coles_rho": 0.0,
        }
        return base, meta

    adjusted: dict[tuple[int, int], float] = {}
    for (home_goals, away_goals), probability in base.items():
        tau = dixon_coles_tau(home_goals, away_goals, home_xg, away_xg, rho)
        if tau <= 0 or not math.isfinite(tau):
            raise ValueError(
                f"Dixon–Coles tau is not positive at {(home_goals, away_goals)} "
                f"for rho={rho} and expected goals {(home_xg, away_xg)}."
            )
        adjusted[(home_goals, away_goals)] = probability * tau
    total = sum(adjusted.values())
    if total <= 0 or not math.isfinite(total):
        raise ValueError("Dixon–Coles score matrix has no valid probability mass.")
    normalised = {key: value / total for key, value in adjusted.items()}
    meta = {
        **meta,
        "approximation": "truncated_dixon_coles_normalised",
        "dependence": "dixon_coles",
        "dixon_coles_rho": rho,
        "raw_mass_before_dixon_coles_norm": float(total),
        "truncation_note": (
            meta["truncation_note"]
            + f" Dixon–Coles rho={rho:.4f} adjusts 0–0, 1–0, 0–1, and 1–1 before renormalising."
        ),
    }
    return normalised, meta


def _normalised_log_probability(home_goals: int, away_goals: int, home_xg: float, away_xg: float, rho: float, grid: int = 10) -> float | None:
    """Log probability of one score under the renormalised Dixon–Coles grid."""
    total = 0.0
    target = None
    for home in range(grid + 1):
        home_pmf = _pmf(home, home_xg)
        for away in range(grid + 1):
            tau = dixon_coles_tau(home, away, home_xg, away_xg, rho)
            if tau <= 0 or not math.isfinite(tau):
                return None
            weight = home_pmf * _pmf(away, away_xg) * tau
            total += weight
            if home == home_goals and away == away_goals:
                target = weight
    if target is None:
        tau = dixon_coles_tau(home_goals, away_goals, home_xg, away_xg, rho)
        if tau <= 0 or not math.isfinite(tau):
            return None
        target = _pmf(home_goals, home_xg) * _pmf(away_goals, away_xg) * tau
        total += target
    if target <= 0 or total <= 0 or not math.isfinite(total):
        return None
    return math.log(target / total)


def fit_dixon_coles_rho(
    home_goals: np.ndarray,
    away_goals: np.ndarray,
    home_xg: np.ndarray,
    away_xg: np.ndarray,
) -> dict[str, Any]:
    """Grid-search rho by maximising normalised Dixon–Coles likelihood on past matches only."""
    home_goals = np.asarray(home_goals, dtype=int)
    away_goals = np.asarray(away_goals, dtype=int)
    home_xg = np.clip(np.asarray(home_xg, dtype=float), 0.05, 5.0)
    away_xg = np.clip(np.asarray(away_xg, dtype=float), 0.05, 5.0)
    if len(home_goals) < 30:
        return {"rho": 0.0, "matches": int(len(home_goals)), "status": "skipped_too_few_matches"}

    best_rho = 0.0
    best_ll = -1e300
    for rho in np.linspace(-0.2, 0.1, 61):
        log_lik = 0.0
        valid = True
        for goals_h, goals_a, rate_h, rate_a in zip(home_goals, away_goals, home_xg, away_xg):
            contribution = _normalised_log_probability(int(goals_h), int(goals_a), float(rate_h), float(rate_a), float(rho))
            if contribution is None:
                valid = False
                break
            log_lik += contribution
        if valid and log_lik > best_ll:
            best_ll = log_lik
            best_rho = float(round(float(rho), 4))
    return {
        "rho": best_rho,
        "matches": int(len(home_goals)),
        "calibration_loglik": None if best_ll < -1e299 else float(best_ll),
        "status": "fitted",
        "objective": "normalised_score_loglik",
        "note": (
            "rho is fit only on the calibration window using expected goals from a model "
            "trained on earlier matches. It is not fit on the holdout."
        ),
    }
