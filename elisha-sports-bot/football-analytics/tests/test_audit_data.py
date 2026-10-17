from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from audit_data import audit_matches


def test_audit_flags_synthetic_source_and_summarizes_team_form(tmp_path):
    path = tmp_path / "synthetic_matches.csv"
    pd.DataFrame([
        {"match_date": "2024-01-01", "home_team": "Alpha FC", "away_team": "Beta FC", "home_goals": 2, "away_goals": 0, "source": "synthetic"},
        {"match_date": "2024-01-08", "home_team": "Gamma FC", "away_team": "Alpha FC", "home_goals": 1, "away_goals": 1, "source": "synthetic"},
    ]).to_csv(path, index=False)

    report = audit_matches(path, team="Alpha FC", as_of="2024-01-09", limit=5)
    assert report["source_assessment"] == "synthetic"
    assert report["valid_rows"] == 2
    assert report["invalid_rows"] == 0
    assert report["team_form"]["record"] == {"wins": 1, "draws": 1, "losses": 0}
    assert report["team_form"]["points"] == 4
    assert report["team_form"]["goals_for"] == 3
    assert report["team_form"]["goals_against"] == 1


def test_audit_counts_missing_scores_and_duplicate_fixtures(tmp_path):
    path = tmp_path / "messy.csv"
    pd.DataFrame([
        {"match_date": "2024-01-01", "home_team": "Alpha FC", "away_team": "Beta FC", "home_goals": 1, "away_goals": 0},
        {"match_date": "2024-01-01", "home_team": "Alpha FC", "away_team": "Beta FC", "home_goals": 1, "away_goals": 0},
        {"match_date": "2024-01-02", "home_team": "Gamma FC", "away_team": "Delta FC", "home_goals": None, "away_goals": 1},
    ]).to_csv(path, index=False)

    report = audit_matches(path)
    assert report["rows_read"] == 3
    assert report["issues"]["rows_in_duplicate_fixture_groups"] == 2
    assert report["issues"]["invalid_or_missing_scores"] == 1
    assert report["valid_rows"] == 0
