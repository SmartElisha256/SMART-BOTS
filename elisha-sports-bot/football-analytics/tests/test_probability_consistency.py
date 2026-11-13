"""Primary 1X2 markets must match the Poisson score model used for correct scores."""
from pathlib import Path
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from predict import poisson_pmf, predict
from train import main as train_main

# Deterministic mini historical fixture (not synthetic-labeled).
UNIT_DATA = ROOT / "data" / "unit_test_historical_mini.csv"


def test_synthetic_only_training_is_rejected(tmp_path, monkeypatch):
    data = ROOT / "data" / "synthetic_matches.csv"
    monkeypatch.chdir(ROOT)
    monkeypatch.setattr(
        sys, "argv", ["train.py", "--data", str(data), "--models-dir", str(tmp_path)]
    )
    with pytest.raises(SystemExit, match="synthetic-only"):
        train_main()


def test_primary_result_markets_match_poisson_score_model(tmp_path, monkeypatch):
    monkeypatch.chdir(ROOT)
    monkeypatch.setattr(
        sys,
        "argv",
        ["train.py", "--data", str(UNIT_DATA), "--models-dir", str(tmp_path)],
    )
    train_main()

    result = predict(
        {"home_team": "Lakeside FC", "away_team": "Hill United"},
        str(UNIT_DATA),
        str(tmp_path),
    )
    home_xg = result["expected_goals"]["home"]
    away_xg = result["expected_goals"]["away"]
    expected = {"home_win": 0.0, "draw": 0.0, "away_win": 0.0}
    for home_goals in range(8):
        for away_goals in range(8):
            probability = poisson_pmf(home_goals, home_xg) * poisson_pmf(away_goals, away_xg)
            if home_goals > away_goals:
                expected["home_win"] += probability
            elif home_goals == away_goals:
                expected["draw"] += probability
            else:
                expected["away_win"] += probability

    total = sum(expected.values())
    expected = {key: value / total for key, value in expected.items()}
    for key, value in expected.items():
        assert result["match_result"][key] == pytest.approx(value, abs=1e-6)

    match_result = result["match_result"]
    assert sum(match_result.values()) == pytest.approx(1.0)
    assert result["double_chance"]["1X"] == pytest.approx(
        match_result["home_win"] + match_result["draw"]
    )
    assert result["double_chance"]["X2"] == pytest.approx(
        match_result["draw"] + match_result["away_win"]
    )
    assert result["double_chance"]["12"] == pytest.approx(
        match_result["home_win"] + match_result["away_win"]
    )
    assert "machine_learning_result" in result
    assert set(result["machine_learning_result"]) >= {"home_win", "draw", "away_win"}
    ml_sum = (
        result["machine_learning_result"]["home_win"]
        + result["machine_learning_result"]["draw"]
        + result["machine_learning_result"]["away_win"]
    )
    assert ml_sum == pytest.approx(1.0)
    assert result["data_quality"]["status"] in {"ok", "limited", "stale"}
