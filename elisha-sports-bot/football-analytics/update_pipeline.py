"""Operator workflow: validate/prepare historical data and print safe retrain steps.

Does not invent live fixtures. Optional HTTPS CSV fetch only when FOOTBALL_RESULTS_CSV_URL
and FOOTBALL_RESULTS_LICENSE_CONFIRMED=true are set (see fetch_matches.py).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(cmd: list[str]) -> None:
    print("+", " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Run fetch_matches.py first (requires env).")
    parser.add_argument("--train", action="store_true", help="Run train.py after a successful prepare.")
    parser.add_argument("--evaluate", action="store_true", help="Run evaluate.py after train.")
    args = parser.parse_args()

    if args.fetch:
        run([sys.executable, "fetch_matches.py"])

    run([sys.executable, "prepare_epl_data.py"])

    meta_path = ROOT / "data" / "dataset_metadata.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        print(json.dumps({"dataset": meta}, indent=2))

    if args.train:
        run([sys.executable, "train.py", "--data", "data/epl_historical.csv"])
    else:
        print("Next (when ready): python3 train.py --data data/epl_historical.csv")
        print("Then restart the Node API and worker processes.")

    if args.evaluate:
        if not args.train:
            print("Note: --evaluate is most useful after --train.")
        run([sys.executable, "evaluate.py", "--data", "data/epl_historical.csv"])


if __name__ == "__main__":
    main()
