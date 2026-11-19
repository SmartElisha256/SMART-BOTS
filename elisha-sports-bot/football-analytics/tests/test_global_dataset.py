import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from global_dataset import GlobalDatasetError, build_global_quality_report, load_global_matches


def valid_rows():
    return pd.DataFrame([
        {
            "match_id": "source-a:101", "source": "provider-a",
            "competition_id": "ENG-PL", "competition_name": "Premier League",
            "country": "England", "season": "2025/2026",
            "match_date": "2025-08-15T19:00:00Z", "status": "FINISHED",
            "home_team_id": "ENG-ARS", "home_team": "Arsenal",
            "away_team_id": "ENG-CHE", "away_team": "Chelsea",
            "home_goals": 2, "away_goals": 1, "home_shots": 14,
            "away_shots": 8, "home_xg": 1.8, "away_xg": 0.7,
        },
        {
            "match_id": "source-a:102", "source": "provider-a",
            "competition_id": "ENG-PL", "competition_name": "Premier League",
            "country": "England", "season": "2025/2026",
            "match_date": "2025-08-16T14:00:00Z", "status": "FT",
            "home_team_id": "ENG-LIV", "home_team": "Liverpool",
            "away_team_id": "ENG-MCI", "away_team": "Manchester City",
            "home_goals": 0, "away_goals": 0, "home_shots": None,
            "away_shots": 10, "home_xg": None, "away_xg": 1.1,
        },
    ])


def test_loads_canonical_multi_competition_rows_and_preserves_missing_stats(tmp_path):
    path = tmp_path / "global.csv"
    valid_rows().to_csv(path, index=False)
    frame = load_global_matches(path)
    assert len(frame) == 2
    assert pd.isna(frame.loc[1, "home_shots"])
    report = build_global_quality_report(frame)
    assert report["matches"] == 2
    assert report["competitions"] == 1
    assert report["optional_stat_coverage"]["home_shots"]["available"] == 1


def test_rejects_missing_canonical_columns(tmp_path):
    frame = valid_rows().drop(columns=["competition_id"])
    path = tmp_path / "missing.csv"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="competition_id"):
        load_global_matches(path)


def test_rejects_duplicate_match_ids(tmp_path):
    frame = valid_rows()
    frame.loc[1, "match_id"] = frame.loc[0, "match_id"]
    path = tmp_path / "duplicate-id.csv"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="Duplicate match_id"):
        load_global_matches(path)


def test_rejects_duplicate_fixture_even_with_different_match_ids(tmp_path):
    frame = valid_rows()
    frame.loc[1, ["competition_id", "match_date", "home_team_id", "away_team_id"]] = [
        frame.loc[0, "competition_id"], frame.loc[0, "match_date"],
        frame.loc[0, "home_team_id"], frame.loc[0, "away_team_id"],
    ]
    path = tmp_path / "duplicate-fixture.csv"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="Duplicate fixtures"):
        load_global_matches(path)


def test_rejects_synthetic_and_unfinished_rows(tmp_path):
    frame = valid_rows()
    frame.loc[0, "source"] = "synthetic"
    path = tmp_path / "synthetic.csv"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="Synthetic"):
        load_global_matches(path)

    frame = valid_rows()
    frame.loc[0, "status"] = "SCHEDULED"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="completed matches"):
        load_global_matches(path)


def test_rejects_invalid_scores_and_optional_stat_values(tmp_path):
    frame = valid_rows()
    frame.loc[0, "home_goals"] = -1
    path = tmp_path / "bad-score.csv"
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="home_goals"):
        load_global_matches(path)

    frame = valid_rows()
    frame.loc[0, "home_possession"] = 140
    frame.to_csv(path, index=False)
    with pytest.raises(GlobalDatasetError, match="exceed 100"):
        load_global_matches(path)
