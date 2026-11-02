"""prepare_epl_data discovers optional seasons and download_data lists only season inputs."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from download_data import list_season_files
from prepare_epl_data import discover_season_files, DATA_DIR, KNOWN_SEASON_FILES


def test_discover_includes_bundled_seasons():
    files = discover_season_files()
    assert any(name.startswith("epl_2024_25") for name in files)
    assert "epl_2020_21.csv" in files
    # Optional future season must not be required if missing
    if "epl_2025_26.csv" not in {p.name for p in DATA_DIR.glob("epl_*.csv")}:
        assert "epl_2025_26.csv" not in files


def test_known_list_documents_optional_2025_26():
    assert "epl_2025_26.csv" in KNOWN_SEASON_FILES


def test_download_listing_excludes_generated_and_test_csvs(tmp_path):
    (tmp_path / "epl_2024_25.csv").write_text("Date,HomeTeam,AwayTeam,FTHG,FTAG\\n")
    (tmp_path / "epl_2025_26.csv").write_text("Date,HomeTeam,AwayTeam,FTHG,FTAG\\n")
    (tmp_path / "epl_historical.csv").write_text("generated output")
    (tmp_path / "epl_test.csv").write_text("test data")
    assert list_season_files(tmp_path) == ["epl_2024_25.csv", "epl_2025_26.csv"]
