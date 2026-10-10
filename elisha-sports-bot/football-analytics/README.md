# Football Analytics ML Module

This is an optional Python module alongside the existing ELISHA SPORTS BOT Node.js app. It does not replace the Node app.

## Important data note

`data/synthetic_matches.csv` is deterministic **synthetic test data**, not real historical match results. Metrics or predictions from it are only pipeline demonstrations and must not be interpreted as evidence of real-world accuracy. For meaningful use, import a properly licensed, documented historical dataset.

## Setup

Python 3.10+ is recommended. From this directory:

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python download_data.py --input data/synthetic_matches.csv
python train.py --data data/synthetic_matches.csv
python evaluate.py --data data/synthetic_matches.csv
pytest -q
```

Training is a separate operation. Runtime predictions only load saved artifacts; they do not retrain models.

## Prediction CLI

```bash
python predict.py --home-team "Example FC" --away-team "Sample United"
```

The command prints JSON. It requires trained artifacts and at least 20 completed matches dated before the prediction cutoff.

## Optional CSV fetch

Set `FOOTBALL_RESULTS_CSV_URL` to a trusted HTTPS URL returning a CSV with columns `match_date,home_team,away_team,home_goals,away_goals`, then run:

```bash
python fetch_matches.py --output data/matches.csv
python download_data.py --input data/matches.csv
python train.py --data data/matches.csv
```

No API key or live provider is configured by default. Check data licensing and provider limits. Do not label a dataset official unless its source confirms that.

## Node.js endpoint

The app exposes `POST /api/football-ml/predict`. JSON body:

```json
{"home_team":"Example FC","away_team":"Sample United","kickoff":"2027-01-12T15:00:00Z"}
```

It runs `predict.py` as a separate process with a timeout. Train models first and configure Python via `PYTHON_BIN` if needed. Missing models or insufficient history return a service error; the endpoint does not fabricate estimates. Existing global app rate limiting remains in effect.

## Method and limitations

Pre-match team features use only previous results (last five appearances per team). The baseline trains a random-forest 1X2 classifier and goal regressors; goal-line, BTTS, and scoreline estimates use independent Poisson approximations from regressed expected goals. Double-chance values are derived from 1X2. This is a modest baseline, not a production betting model. Evaluation uses a chronological holdout; larger real datasets, calibration analysis, competition-aware validation, and monitoring are needed before relying on probabilities.

The API returns form summaries, expected goals, top correct-score estimates, confidence flags, and warnings. The probability values are not guarantees.
