"""Validation and reporting for the canonical multi-competition match dataset.

This module deliberately does not train models. It establishes a strict, provider-neutral
contract before any competition is admitted to downstream analytics.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = (
    "match_id", "source", "competition_id", "competition_name", "country",
    "season", "match_date", "status", "home_team_id", "home_team",
    "away_team_id", "away_team", "home_goals", "away_goals",
)

OPTIONAL_NUMERIC_COLUMNS = (
    "half_time_home_goals", "half_time_away_goals",
    "home_possession", "away_possession",
    "home_shots", "away_shots", "home_shots_on_target", "away_shots_on_target",
    "home_corners", "away_corners", "home_fouls", "away_fouls",
    "home_yellow_cards", "away_yellow_cards", "home_red_cards", "away_red_cards",
    "home_xg", "away_xg",
)

FINISHED_STATUSES = {"finished", "ft", "aet", "pen", "completed", "full_time"}


class GlobalDatasetError(ValueError):
    """Raised when a multi-competition dataset violates the canonical contract."""


def load_global_matches(path: str | Path) -> pd.DataFrame:
    """Load and validate canonical completed-match CSV records.

    Missing optional statistics remain NaN; they are never silently converted to zero.
    """
    source_path = Path(path)
    if not source_path.is_file():
        raise FileNotFoundError(f"Global match dataset not found: {source_path}")

    frame = pd.read_csv(source_path)
    missing = [column for column in REQUIRED_COLUMNS if column not in frame.columns]
    if missing:
        raise GlobalDatasetError("Missing required columns: " + ", ".join(missing))
    if frame.empty:
        raise GlobalDatasetError("Global match dataset contains no records.")

    frame = frame.copy()
    string_columns = (
        "match_id", "source", "competition_id", "competition_name", "country",
        "season", "status", "home_team_id", "home_team", "away_team_id", "away_team",
    )
    for column in string_columns:
        values = frame[column].astype("string").str.strip()
        if values.isna().any() or values.eq("").any():
            raise GlobalDatasetError(f"{column} contains missing or blank values.")
        frame[column] = values

    frame["match_date"] = pd.to_datetime(frame["match_date"], errors="coerce", utc=True)
    if frame["match_date"].isna().any():
        raise GlobalDatasetError("match_date contains invalid or missing timestamps.")

    status = frame["status"].str.casefold().str.replace(r"[\s-]+", "_", regex=True)
    if not status.isin(FINISHED_STATUSES).all():
        invalid = sorted(status.loc[~status.isin(FINISHED_STATUSES)].unique().tolist())
        raise GlobalDatasetError(
            "Only completed matches may enter historical training data; invalid statuses: "
            + ", ".join(invalid)
        )
    frame["status"] = status

    for column in ("home_goals", "away_goals"):
        numeric = pd.to_numeric(frame[column], errors="coerce")
        if numeric.isna().any() or (numeric < 0).any() or (numeric % 1 != 0).any():
            raise GlobalDatasetError(f"{column} must contain non-negative whole numbers.")
        frame[column] = numeric.astype("int64")

    if frame["match_id"].duplicated().any():
        raise GlobalDatasetError("Duplicate match_id values found.")

    if (frame["home_team_id"].str.casefold() == frame["away_team_id"].str.casefold()).any():
        raise GlobalDatasetError("A team cannot play itself (matching team IDs).")
    if (frame["home_team"].str.casefold() == frame["away_team"].str.casefold()).any():
        raise GlobalDatasetError("A team cannot play itself (matching team names).")

    fixture_key = pd.DataFrame({
        "competition_id": frame["competition_id"].str.casefold(),
        "match_day": frame["match_date"].dt.normalize(),
        "home_team_id": frame["home_team_id"].str.casefold(),
        "away_team_id": frame["away_team_id"].str.casefold(),
    })
    if fixture_key.duplicated().any():
        raise GlobalDatasetError(
            "Duplicate fixtures found for the same competition, date and ordered team IDs."
        )

    future_cutoff = pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=1)
    if (frame["match_date"] > future_cutoff).any():
        raise GlobalDatasetError("Completed-match dataset contains future-dated records.")

    if frame["source"].str.casefold().eq("synthetic").any():
        raise GlobalDatasetError("Synthetic test rows are not permitted in the global historical dataset.")

    for column in OPTIONAL_NUMERIC_COLUMNS:
        if column not in frame.columns:
            continue
        original = frame[column]
        numeric = pd.to_numeric(original, errors="coerce")
        nonblank = original.notna() & original.astype("string").str.strip().ne("")
        if (nonblank & numeric.isna()).any():
            raise GlobalDatasetError(f"{column} contains non-numeric values.")
        if (numeric.dropna() < 0).any():
            raise GlobalDatasetError(f"{column} cannot contain negative values.")
        if "possession" in column and (numeric.dropna() > 100).any():
            raise GlobalDatasetError(f"{column} cannot exceed 100 percent.")
        frame[column] = numeric

    return frame.sort_values(
        ["competition_id", "match_date", "match_id"], kind="stable"
    ).reset_index(drop=True)


def build_global_quality_report(frame: pd.DataFrame) -> dict:
    """Summarise coverage without treating absent optional fields as zero."""
    competitions = []
    for competition_id, group in frame.groupby("competition_id", sort=True):
        competitions.append({
            "competition_id": str(competition_id),
            "competition_name": str(group["competition_name"].iloc[0]),
            "country": str(group["country"].iloc[0]),
            "matches": int(len(group)),
            "seasons": sorted(group["season"].astype(str).unique().tolist()),
            "date_from": group["match_date"].min().date().isoformat(),
            "date_to": group["match_date"].max().date().isoformat(),
        })

    optional_coverage = {}
    for column in OPTIONAL_NUMERIC_COLUMNS:
        if column in frame.columns:
            optional_coverage[column] = {
                "available": int(frame[column].notna().sum()),
                "missing": int(frame[column].isna().sum()),
                "coverage_ratio": round(float(frame[column].notna().mean()), 4),
            }

    return {
        "schema_version": "1.0",
        "status": "validated",
        "matches": int(len(frame)),
        "competitions": int(frame["competition_id"].nunique()),
        "teams": int(pd.concat([frame["home_team_id"], frame["away_team_id"]]).nunique()),
        "date_from": frame["match_date"].min().date().isoformat(),
        "date_to": frame["match_date"].max().date().isoformat(),
        "sources": sorted(frame["source"].astype(str).unique().tolist()),
        "competition_coverage": competitions,
        "optional_stat_coverage": optional_coverage,
        "synthetic_rows_included": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="Path to canonical global match CSV.")
    parser.add_argument("--output", help="Optional JSON report output path.")
    args = parser.parse_args()

    frame = load_global_matches(args.data)
    report = build_global_quality_report(frame)
    rendered = json.dumps(report, indent=2)
    if args.output:
        Path(args.output).write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


if __name__ == "__main__":
    main()
