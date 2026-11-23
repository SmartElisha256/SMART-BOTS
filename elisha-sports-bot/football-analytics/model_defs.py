"""Shared model definitions for training and evaluation (v7).

Why this module exists
----------------------
Earlier versions used 37 features with deep gradient-boosting models on roughly
1,600 training matches. On the chronological holdout that over-fit badly: the
classifier's log loss (1.43) was worse than guessing 1/3 for every outcome (1.10).

v7 uses small, heavily regularised models instead:

* a Poisson regression (GLM) for each team's expected goals, which drives the
  1X2 / goals markets (the numbers users actually see), and
* a multinomial logistic regression as a cross-check classifier.

Both use the same short feature list, so ``predict.py`` can feed one feature
vector to every model.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression, PoissonRegressor
from sklearn.metrics import log_loss
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MODEL_FEATURES = (
    "elo_diff",
    "home_form_points", "away_form_points",
    "home_home_form_points", "away_away_form_points",
    "home_goals_for_avg", "away_goals_for_avg",
    "home_goals_against_avg", "away_goals_against_avg",
)

RESULT_C_GRID = (0.03, 0.1, 0.3, 1.0)
GOAL_ALPHA_GRID = (0.01, 0.1, 0.5, 1.0, 3.0)
DEFAULT_C = 0.3
DEFAULT_ALPHA = 1.0
CLASSES = ("A", "D", "H")
GRID_SIZE = 15
_FACTORIALS = np.array([math.factorial(k) for k in range(GRID_SIZE + 1)], dtype=float)


def build_result_model(C: float = DEFAULT_C):
    return make_pipeline(StandardScaler(), LogisticRegression(C=C, max_iter=2000))


def build_goal_model(alpha: float = DEFAULT_ALPHA):
    return make_pipeline(StandardScaler(), PoissonRegressor(alpha=alpha, max_iter=2000))


def _matrix(frame: pd.DataFrame, features: Sequence[str] = MODEL_FEATURES) -> pd.DataFrame:
    return frame[list(features)].astype(float)


def grid_1x2(home_xg, away_xg, rho: float = 0.0) -> np.ndarray:
    """Vectorised Poisson (+ optional Dixon-Coles low-score) 1X2 probabilities.

    Returns an array with columns ordered ``A, D, H`` (away, draw, home).
    """
    hx = np.clip(np.asarray(home_xg, dtype=float), 0.05, 5.0)
    ax = np.clip(np.asarray(away_xg, dtype=float), 0.05, 5.0)
    k = np.arange(GRID_SIZE + 1, dtype=float)
    ph = np.exp(-hx[:, None]) * hx[:, None] ** k / _FACTORIALS
    pa = np.exp(-ax[:, None]) * ax[:, None] ** k / _FACTORIALS
    joint = ph[:, :, None] * pa[:, None, :]
    if abs(rho) > 1e-12:
        joint[:, 0, 0] *= 1.0 - hx * ax * rho
        joint[:, 0, 1] *= 1.0 + hx * rho
        joint[:, 1, 0] *= 1.0 + ax * rho
        joint[:, 1, 1] *= 1.0 - rho
    joint /= joint.sum(axis=(1, 2), keepdims=True)
    i, j = np.indices((GRID_SIZE + 1, GRID_SIZE + 1))
    home = (joint * (i > j)).sum(axis=(1, 2))
    draw = (joint * (i == j)).sum(axis=(1, 2))
    away = (joint * (i < j)).sum(axis=(1, 2))
    return np.column_stack([away, draw, home])


def fit_models(frame: pd.DataFrame, C: float = DEFAULT_C, alpha: float = DEFAULT_ALPHA):
    X = _matrix(frame)
    y = frame["result"].astype(str).map({c: i for i, c in enumerate(CLASSES)}).to_numpy()
    result_model = build_result_model(C).fit(X, y)
    home_model = build_goal_model(alpha).fit(X, frame["home_goals"].astype(float))
    away_model = build_goal_model(alpha).fit(X, frame["away_goals"].astype(float))
    return result_model, home_model, away_model


def goal_rates(home_model, away_model, frame: pd.DataFrame):
    X = _matrix(frame)
    return (np.clip(home_model.predict(X), 0.05, 5.0), np.clip(away_model.predict(X), 0.05, 5.0))


def _safe_log_loss(y_true, proba) -> float:
    return float(log_loss(np.asarray(y_true, dtype=str), np.clip(proba, 1e-9, 1.0), labels=list(CLASSES)))


def select_hyperparameters(fit_frame: pd.DataFrame, valid_frame: pd.DataFrame) -> dict:
    X_fit, X_val = _matrix(fit_frame), _matrix(valid_frame)
    y_fit = fit_frame["result"].astype(str).map({c: i for i, c in enumerate(CLASSES)}).to_numpy()
    y_val = valid_frame["result"].astype(str).to_numpy()

    by_c = {}
    for C in RESULT_C_GRID:
        proba = build_result_model(C).fit(X_fit, y_fit).predict_proba(X_val)
        by_c[C] = _safe_log_loss(y_val, proba)
    by_alpha = {}
    for alpha in GOAL_ALPHA_GRID:
        home = build_goal_model(alpha).fit(X_fit, fit_frame["home_goals"].astype(float))
        away = build_goal_model(alpha).fit(X_fit, fit_frame["away_goals"].astype(float))
        hx, ax = goal_rates(home, away, valid_frame)
        by_alpha[alpha] = _safe_log_loss(y_val, grid_1x2(hx, ax))
    return {
        "C": min(by_c, key=by_c.get),
        "alpha": min(by_alpha, key=by_alpha.get),
        "classifier_log_loss_by_C": {str(k): round(v, 4) for k, v in by_c.items()},
        "grid_log_loss_by_alpha": {str(k): round(v, 4) for k, v in by_alpha.items()},
        "validation_matches": int(len(valid_frame)),
    }


def split_for_validation(frame: pd.DataFrame, fraction: float = 0.15):
    days = list(frame["match_date"].dt.normalize().drop_duplicates().sort_values())
    cut = days[max(1, int(len(days) * (1.0 - fraction)))]
    day = frame["match_date"].dt.normalize()
    return frame[day < cut], frame[day >= cut]
