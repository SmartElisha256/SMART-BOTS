"""Validate a historical match CSV before it is used for training."""
import argparse
from features import load_matches

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/synthetic_matches.csv")
    args = parser.parse_args()
    df = load_matches(args.input)
    print(f"Validated {len(df)} matches from {df['match_date'].min().date()} to {df['match_date'].max().date()}.")
    if "source" in df and (df["source"] == "synthetic").all():
        print("WARNING: this is synthetic test data, not real historical results.")

if __name__ == "__main__":
    main()
