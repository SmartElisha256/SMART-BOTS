"""Mandatory vs optional season CSV columns."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from prepare_epl_data import REQUIRED_SEASON_COLUMNS, OPTIONAL


def test_mandatory_columns_documented():
    assert REQUIRED_SEASON_COLUMNS == {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"}


def test_optional_shot_corner_card_columns():
    assert set(OPTIONAL.keys()) == {
        "HS", "AS", "HST", "AST", "HC", "AC", "HF", "AF", "HY", "AY", "HR", "AR",
    }
