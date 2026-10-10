"""Chronological holdout evaluation for the baseline models."""
import argparse, json
from pathlib import Path
from train import main as train_main
from features import load_matches, build_training_frame

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/synthetic_matches.csv")
    args = parser.parse_args()
    df = load_matches(args.data)
    frame = build_training_frame(df)
    split = max(15, int(len(frame) * 0.8))
    if split >= len(frame): split = len(frame) - 1
    print(json.dumps({
        "matches": len(frame),
        "train_matches": split,
        "test_matches": len(frame) - split,
        "validation": "chronological holdout; later rows are held out",
        "note": "Run python train.py to fit models and write evaluation.json. Metrics on synthetic data are pipeline checks, not real-world performance."
    }, indent=2))

if __name__ == "__main__":
    main()
