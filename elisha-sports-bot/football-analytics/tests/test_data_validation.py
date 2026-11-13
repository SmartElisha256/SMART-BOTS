from pathlib import Path

import pandas as pd
import pytest

from features import DataQualityError, load_matches


def test_duplicate_fixture_rejected_even_when_timestamp_and_team_case_differ(tmp_path):
    path = tmp_path / "duplicates.csv"
    pd.DataFrame([
        {"match_date": "2025-01-10T12:00:00Z", "home_team": "Arsenal", "away_team": "Chelsea", "home_goals": 1, "away_goals": 0},
        {"match_date": "2025-01-10T18:00:00Z", "home_team": "arsenal", "away_team": "CHELSEA", "home_goals": 2, "away_goals": 0},
    ]).to_csv(path, index=False)
    with pytest.raises(DataQualityError, match="Duplicate fixtures"):
        load_matches(path)


def test_non_duplicate_fixtures_on_same_day_are_allowed(tmp_path):
    path = tmp_path / "same_day.csv"
    pd.DataFrame([
        {"match_date": "2025-01-10", "home_team": "Arsenal", "away_team": "Chelsea", "home_goals": 1, "away_goals": 0},
        {"match_date": "2025-01-10", "home_team": "Spurs", "away_team": "United", "home_goals": 2, "away_goals": 1},
    ]).to_csv(path, index=False)
    assert len(load_matches(path)) == 2
