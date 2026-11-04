"""Dixon–Coles dependence and chronological isotonic calibration."""
import numpy as np

from calibration import apply_multiclass_isotonic, fit_multiclass_isotonic
from dixon_coles import build_dixon_coles_score_matrix, dixon_coles_tau, fit_dixon_coles_rho
from markets import build_poisson_score_matrix


def test_zero_rho_matches_independent_poisson():
    poisson, poisson_meta = build_poisson_score_matrix(1.4, 1.1)
    adjusted, meta = build_dixon_coles_score_matrix(1.4, 1.1, 0.0)
    assert meta["dependence"] == "independent_poisson"
    assert poisson_meta["approximation"] == "truncated_independent_poisson_normalised"
    for key, probability in poisson.items():
        assert abs(adjusted[key] - probability) < 1e-12


def test_negative_rho_increases_low_score_draws():
    poisson, _meta = build_poisson_score_matrix(1.35, 1.15)
    adjusted, meta = build_dixon_coles_score_matrix(1.35, 1.15, -0.08)
    assert meta["dependence"] == "dixon_coles"
    assert adjusted[(0, 0)] > poisson[(0, 0)]
    assert adjusted[(1, 1)] > poisson[(1, 1)]
    assert abs(sum(adjusted.values()) - 1.0) < 1e-9
    assert dixon_coles_tau(0, 0, 1.35, 1.15, -0.08) > 1.0


def test_rho_fit_recovers_negative_dependence_direction():
    rng = np.random.default_rng(7)
    # Extra mass on 0-0 and 1-1 relative to independent rates near 1.3 / 1.1.
    scores = [(0, 0)] * 40 + [(1, 1)] * 40 + [(1, 0)] * 25 + [(0, 1)] * 20 + [(2, 1)] * 20 + [(2, 0)] * 15
    home = np.array([h for h, _a in scores])
    away = np.array([a for _h, a in scores])
    info = fit_dixon_coles_rho(home, away, np.full(len(home), 1.3), np.full(len(away), 1.1))
    assert info["status"] == "fitted"
    assert info["rho"] < 0
    assert rng is not None


def test_isotonic_pulls_overconfident_class_down():
    classes = ["A", "D", "H"]
    # Model always emits 0.8 for H, but H is right only half the time.
    rows = []
    labels = []
    for i in range(80):
        rows.append([0.1, 0.1, 0.8])
        labels.append("H" if i % 2 == 0 else "A")
    proba = np.array(rows, dtype=float)
    calibrators = fit_multiclass_isotonic(proba, np.array(labels), classes)
    adjusted = apply_multiclass_isotonic(np.array([[0.1, 0.1, 0.8]]), calibrators)[0]
    assert abs(adjusted.sum() - 1.0) < 1e-9
    assert adjusted[2] < 0.7
