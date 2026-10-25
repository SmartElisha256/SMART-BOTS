"""Tests for Poisson-derived market consistency and adaptive score grid."""
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from markets import (
    markets_from_score_matrix,
    market_rows_for_display,
    build_poisson_score_matrix,
)
from predict import poisson_pmf


def _matrix(home_xg=1.4, away_xg=1.1, max_g=7):
    m = {}
    for h in range(max_g + 1):
        for a in range(max_g + 1):
            m[(h, a)] = poisson_pmf(h, home_xg) * poisson_pmf(a, away_xg)
    total = sum(m.values())
    return {k: v / total for k, v in m.items()}


def test_match_result_sums_to_one():
    markets = markets_from_score_matrix(_matrix(), 1.4, 1.1)
    assert sum(markets["match_result"].values()) == pytest.approx(1.0, abs=1e-9)


def test_double_chance_consistency():
    markets = markets_from_score_matrix(_matrix(), 1.6, 0.9)
    mr = markets["match_result"]
    assert markets["double_chance"]["1X"] == pytest.approx(mr["home_win"] + mr["draw"])
    assert markets["double_chance"]["X2"] == pytest.approx(mr["draw"] + mr["away_win"])
    assert markets["double_chance"]["12"] == pytest.approx(mr["home_win"] + mr["away_win"])


def test_goal_lines_complementary():
    markets = markets_from_score_matrix(_matrix(), 1.2, 1.2)
    gm = markets["goal_markets"]
    for line in ("0_5", "1_5", "2_5", "3_5", "4_5", "5_5"):
        assert gm[f"over_{line}"] + gm[f"under_{line}"] == pytest.approx(1.0)


def test_btts_complementary():
    markets = markets_from_score_matrix(_matrix(), 1.5, 1.3)
    assert markets["btts"]["yes"] + markets["btts"]["no"] == pytest.approx(1.0)


def test_draw_no_bet_renormalises():
    markets = markets_from_score_matrix(_matrix(), 1.8, 1.0)
    dnb = markets["draw_no_bet"]
    assert dnb["home"] + dnb["away"] == pytest.approx(1.0)
    assert 0 <= dnb["push_probability"] <= 1


def test_half_time_marked_unavailable():
    markets = markets_from_score_matrix(_matrix(), 1.0, 1.0)
    assert markets["half_time"]["available"] is False


def test_market_rows_percentages_in_bounds():
    markets = markets_from_score_matrix(_matrix(), 1.3, 1.1)
    rows = market_rows_for_display(markets)
    assert len(rows) > 10
    for row in rows:
        assert 0 <= row["probability_pct"] <= 100


def test_low_xg_grid_small_residual():
    matrix, meta = build_poisson_score_matrix(0.8, 0.6)
    assert meta["omitted_tail_mass_estimate"] < 1e-5
    assert sum(matrix.values()) == pytest.approx(1.0)


def test_extreme_xg_expands_grid_and_stays_valid():
    matrix, meta = build_poisson_score_matrix(4.5, 3.8)
    assert meta["max_goals_per_team"] >= 10
    assert meta["omitted_tail_mass_estimate"] < 1e-4 or meta["max_goals_per_team"] >= 14
    markets = markets_from_score_matrix(
        matrix, 4.5, 3.8, max_goals=meta["max_goals_per_team"], grid_meta=meta
    )
    assert sum(markets["match_result"].values()) == pytest.approx(1.0, abs=1e-8)
    for v in markets["match_result"].values():
        assert v >= 0 and v == v


def test_goal_ranges_partition_total():
    markets = markets_from_score_matrix(_matrix(1.5, 1.2), 1.5, 1.2)
    assert sum(markets["goal_ranges"].values()) == pytest.approx(1.0, abs=1e-9)


def test_invalid_xg_rejected():
    with pytest.raises(ValueError):
        build_poisson_score_matrix(-1.0, 1.0)
    with pytest.raises(ValueError):
        build_poisson_score_matrix(float("nan"), 1.0)


def test_top_score_note_present():
    markets = markets_from_score_matrix(_matrix(), 1.4, 1.1)
    assert "mode" in markets["correct_score_note"].lower() or "rank" in markets["correct_score_note"].lower()
