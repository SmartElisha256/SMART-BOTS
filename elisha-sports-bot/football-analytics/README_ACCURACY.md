# Accuracy upgrade (v6)

## Score model
Dixon–Coles low-score adjustment on the Poisson grid (`dixon_coles.py`). `rho` is fit on a chronological calibration window only. `rho = 0` keeps independent Poisson.

## Classifier probabilities
One-vs-rest isotonic calibration is fit on earlier calibration matches and **kept only if it lowers log loss** on a later slice of that same window. The holdout is not used to make that choice. If it does not help, raw classifier probabilities are shipped.

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

`train.py` on the full EPL file uses three date windows: fit, calibration, holdout. Weight fitting stops before the calibration window. The shipped model is therefore not refit on the holdout.

## Tip policy (Node quality gate)
- ≥ 50 historical matches
- confidence not low/limited/very_low
- top probability ≥ 0.48

## Resolve live tips
```bash
python3 resolve_predictions.py --predictions preds.csv --results data/epl_historical.csv
```
