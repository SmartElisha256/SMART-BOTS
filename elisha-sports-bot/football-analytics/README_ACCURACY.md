# Accuracy upgrade (v5)

## Features
- Rolling form + venue-specific form (home-only / away-only)
- Elo ratings (leakage-safe, updated after each match)
- Head-to-head window
- Congestion (matches in last 14 days)
- Match statistics (shots, SOT, corners, cards)

## Model
HistGradientBoosting (sklearn) — no extra native deps beyond scikit-learn.

## Train (real EPL only)
```bash
python3 prepare_epl_data.py
python3 train.py --data data/epl_historical.csv
python3 evaluate.py --data data/epl_historical.csv
python3 evaluate_walkforward.py --data data/epl_historical.csv
```

## Tip policy (Node quality gate)
- ≥ 50 historical matches
- confidence not low/limited/very_low
- top probability ≥ 0.48

## Resolve live tips
```bash
python3 resolve_predictions.py --predictions preds.csv --results data/epl_historical.csv
```
