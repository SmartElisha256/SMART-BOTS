""""Validate a historical match CSV (or list bundled seasons).

For licensed HTTPS fetches use fetch_matches.py with FOOTBALL_RESULTS_CSV_URL and
FOOTBALL_RESULTS_LICENSE_CONFIRMED=true. For rebuild + optional train use update_pipeline.py.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

from features import load_matches

DATA_DIR = Path(__file__).resolve().parent / "data"
SEASON_FILE_RE = re.compile(r"^epl_\d{4}_\d{2}\.csv$")


def list_season_files(data_dir: Path = DATA_DIR) -> list[str]:
    """List only season inputs, excluding generated history and test datasets."""
    return sorted(
        path.name
        for path in data_dir.glob("epl_*.csv")
        if path.is_file() and SEASON_FILE_RE.fullmatch(path.name)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=None, help="CSV to validate (default: list seasons only).")
    parser.add_argument("--list-seasons", action="store_true", help="List available epl_YYYY_YY.csv season files.")
    args = parser.parse_args()

    if args.list_seasons or not args.input:
        seasons = list_season_files()
        print("Bundled / available season files:")
        for name in seasons:
            print(f"  - {name}")
        if not seasons:
            print("  (none found)")
        print("To rebuild history: python3 prepare_epl_data.py")
        print("To fetch licensed CSV: python3 fetch_matches.py  (see env requirements)")
        if not args.input:
            return

    path = Path(args.input)
    df = load_matches(path)
    print(
        f"Validated {len(df)} matches from {df['match_date'].min().date()} "
        f"to {df['match_date'].max().date()}."
    )
    if "source" in df.columns and (df["source"].astype(str).str.lower() == "synthetic").all():
        print("WARNING: this is synthetic test data, not real historical results.")


if __name__ == "__main__":
    main()
