from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from sklearn.preprocessing import LabelEncoder

import predict as prediction_module
from features import FEATURES


class FakeClassifier:
    def predict_proba(self, X):
        return np.array([[0.3, 0.25, 0.45]])

    def predict(self, X):
        return np.array([2])


class FakeRegressor:
    def __init__(self, value):
        self.value = value

    def predict(self, X):
        return np.array([self.value])


@pytest.fixture
def history_csv(tmp_path):
    teams = ["Arsenal", "Chelsea", "Spurs", "United"]
    rows = []
    for i in range(80):
        home = teams[i % len(teams)]
        away = teams[(i + 1 + (i // len(teams))) % len(teams)]
        if home == away:
            away = teams[(teams.index(home) + 1) % len(teams)]
        rows.append({
            "match_date": (pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(days=i)).isoformat(),
            "home_team": home,
            "away_team": away,
            "home_goals": i % 4,
            "away_goals": (i + 1) % 3,
        })
    path = tmp_path / "history.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


@pytest.fixture
def fake_models(tmp_path, monkeypatch):
    models_dir = tmp_path / "models"
    models_dir.mkdir()
    for name in ("result.joblib", "home_goals.joblib", "away_goals.joblib"):
        (models_dir / name).touch()
    artifact = {
        "model": FakeClassifier(),
        "encoder": LabelEncoder().fit(["A", "D", "H"]),
        "features": list(FEATURES),
        "trained_until": "2024-03-20T00:00:00+00:00",
        "synthetic_data": False,
        "model_version": "test-fixture",
    }

    def fake_load(path):
        name = Path(path).name
        if name == "result.joblib":
            return artifact
        if name == "home_goals.joblib":
            return FakeRegressor(1.5)
        if name == "away_goals.joblib":
            return FakeRegressor(1.0)
        raise AssertionError(f"Unexpected model artifact: {path}")

    monkeypatch.setattr(prediction_module.joblib, "load", fake_load)
    return models_dir


def test_valid_future_fixture_returns_separate_ml_and_poisson_outputs(history_csv, fake_models):
    result = prediction_module.predict(
        {"home_team": "Arsenal", "away_team": "Chelsea", "kickoff": "2026-11-10T15:00:00Z"},
        data_path=history_csv,
        models_dir=fake_models,
    )
    assert result["prediction_available"] is True
    assert set(("match_result", "machine_learning_result", "markets_meta")) <= set(result)
    assert result["markets_meta"]["poisson_grid"]["approximation"] == "truncated_independent_poisson_normalised"
    assert result["data_quality"]["status"] == "stale"
    assert any("stale" in warning.lower() for warning in result["data_quality"]["warnings"])


def test_unknown_team_returns_unavailable_instead_of_probabilities(history_csv, fake_models):
    result = prediction_module.predict(
        {"home_team": "Unknown FC", "away_team": "Chelsea", "kickoff": "2024-03-20T00:00:00Z"},
        data_path=history_csv,
        models_dir=fake_models,
    )
    assert result["prediction_available"] is False
    assert "Unknown FC" in result["unavailable_reason"]
    assert "match_result" not in result


def test_historical_kickoff_is_explicitly_warned(history_csv, fake_models):
    result = prediction_module.predict(
        {"home_team": "Arsenal", "away_team": "Chelsea", "kickoff": "2024-02-20T15:00:00Z"},
        data_path=history_csv,
        models_dir=fake_models,
    )
    assert result["prediction_available"] is True
    assert any("historical-style" in warning for warning in result["data_quality"]["warnings"])


def test_malformed_kickoff_is_rejected_before_model_load(history_csv, tmp_path):
    with pytest.raises(ValueError, match="valid ISO"):
        prediction_module.predict(
            {"home_team": "Arsenal", "away_team": "Chelsea", "kickoff": "not-a-date"},
            data_path=history_csv,
            models_dir=tmp_path / "missing-models",
        )


def test_missing_model_artifacts_fail_explicitly(history_csv, tmp_path):
    with pytest.raises(FileNotFoundError, match="Models are not trained"):
        prediction_module.predict(
            {"home_team": "Arsenal", "away_team": "Chelsea"},
            data_path=history_csv,
            models_dir=tmp_path / "missing-models",
        )
