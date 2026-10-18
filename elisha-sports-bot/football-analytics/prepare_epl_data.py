"""Combine football-data.co.uk EPL season CSVs into a normalized training dataset."""
from pathlib import Path
import pandas as pd

DATA_DIR = Path(__file__).resolve().parent / "data"
SEASON_FILES = ["epl_2020_21.csv", "epl_2021_22.csv", "epl_2022_23.csv", "epl_2023_24.csv", "epl_2024_25.csv"]
OUTPUT = DATA_DIR / "epl_historical.csv"
OPTIONAL = {
    "HS": "home_shots", "AS": "away_shots",
    "HST": "home_shots_on_target", "AST": "away_shots_on_target",
    "HC": "home_corners", "AC": "away_corners",
    "HF": "home_fouls", "AF": "away_fouls",
    "HY": "home_yellow_cards", "AY": "away_yellow_cards",
    "HR": "home_red_cards", "AR": "away_red_cards",
}

def main():
    frames = []
    for filename in SEASON_FILES:
        path = DATA_DIR / filename
        if not path.exists():
            raise FileNotFoundError(f"Missing season file: {path}")
        df = pd.read_csv(path, encoding="utf-8-sig")
        required = {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"}
        missing = required - set(df.columns)
        if missing:
            raise ValueError(f"{filename} is missing columns: {', '.join(sorted(missing))}")
        normalized = pd.DataFrame({
            "match_date": pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce", dayfirst=True, utc=True),
            "home_team": df["HomeTeam"].astype("string").str.strip(),
            "away_team": df["AwayTeam"].astype("string").str.strip(),
            "home_goals": pd.to_numeric(df["FTHG"], errors="coerce"),
            "away_goals": pd.to_numeric(df["FTAG"], errors="coerce"),
        })
        for source, target in OPTIONAL.items():
            if source in df.columns:
                normalized[target] = pd.to_numeric(df[source], errors="coerce")
        normalized = normalized.dropna(subset=["match_date", "home_team", "away_team", "home_goals", "away_goals"])
        frames.append(normalized)
    combined = pd.concat(frames, ignore_index=True)
    if combined.duplicated(["match_date", "home_team", "away_team"]).any():
        raise ValueError("Duplicate fixtures detected across season files.")
    for column in ("home_goals", "away_goals"):
        if (combined[column] < 0).any() or (combined[column] % 1 != 0).any():
            raise ValueError(f"{column} contains invalid scores.")
        combined[column] = combined[column].astype(int)
    combined = combined.sort_values("match_date", kind="stable").reset_index(drop=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    combined.to_csv(OUTPUT, index=False, date_format="%Y-%m-%dT%H:%M:%SZ")
    print(f"Saved {len(combined)} completed EPL matches to {OUTPUT}")
    print(f"Date range: {combined['match_date'].min().date()} to {combined['match_date'].max().date()}")
    print("Optional match statistics included: " + ", ".join(c for c in OPTIONAL.values() if c in combined.columns))

if __name__ == "__main__":
    main()
