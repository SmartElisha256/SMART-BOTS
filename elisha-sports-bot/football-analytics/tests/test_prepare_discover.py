"""prepare_epl_data discovers season files without hard failure on optional seasons."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

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
