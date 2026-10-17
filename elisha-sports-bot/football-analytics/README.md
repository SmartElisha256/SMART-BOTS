# Football Analytics ML Module

This optional Python module works alongside the ELISHA SPORTS BOT Node.js app. Node.js handles chat/webhooks; Python validates historical data, trains models, evaluates them and returns structured predictions.

## Data and safety

The repository contains five EPL season CSVs (2020/21 through 2024/25) plus data/synthetic_matches.csv. The synthetic file is only for deterministic pipeline tests; results from it are NOT evidence of real-world accuracy. Check the source, licensing, and completeness of any real dataset before using it.

## Setup and recommended workflow

Python 3.10+ is recommended. From this directory:

    python -m venv .venv
    # Linux/macOS: source .venv/bin/activate
    # Windows PowerShell: .venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt

    # Combine the five included season CSVs into one normalized dataset.
    python prepare_epl_data.py
    python download_data.py --input data/epl_historical.csv

    # Train artifacts, then evaluate on a chronological holdout.
    python train.py --data data/epl_historical.csv
    python evaluate.py --data data/epl_historical.csv
    pytest -q

Training is a separate operation. Runtime predictions only load saved artifacts; they do not retrain models. Generated model files are ignored by Git and must be created in each deployment environment.

For a quick pipeline smoke test only, use data/synthetic_matches.csv; never interpret those metrics as actual football forecasting performance.

## Data-quality audit and team form report

Before training or publishing historical statistics, inspect the source CSV:

    python audit_data.py --data data/epl_historical.csv
    python audit_data.py --data data/epl_historical.csv --team "Arsenal" --as-of 2025-05-25 --limit 5

The audit reports rows read/accepted, invalid dates, missing or invalid scores, blank team names, self-fixtures, duplicate fixture groups, date coverage, and whether the CSV explicitly labels itself synthetic. The optional team report summarizes the latest completed matches before the cutoff: W/D/L, points, goals for/against, opponent, venue and score.

The audit deliberately excludes invalid rows from its team-form summary and reports the counts. It cannot prove a CSV is authentic: verify the source provider, original download, season coverage and data licence yourself. Do not treat synthetic data or a filename as proof of real-world quality.

## Prediction CLI

    python predict.py --home-team "Example FC" --away-team "Sample United"

The command prints JSON. It requires trained artifacts and at least 20 completed historical matches before the prediction cutoff.

## Optional CSV fetch

Set FOOTBALL_RESULTS_CSV_URL to a trusted HTTPS URL returning a CSV with columns match_date,home_team,away_team,home_goals,away_goals, then run:

    python fetch_matches.py --output data/matches.csv
    python download_data.py --input data/matches.csv
    python train.py --data data/matches.csv
    python evaluate.py --data data/matches.csv

No API key or live provider is configured by default. Check data licensing and provider limits. Do not label a dataset official unless its source confirms that.

## Node.js endpoint

The app exposes POST /api/football-ml/predict. JSON body:

    {"home_team":"Example FC","away_team":"Sample United","kickoff":"2027-01-12T15:00:00Z"}

It runs predict.py as a separate process with a timeout. Train models first and configure Python via PYTHON_BIN if needed. Missing models or insufficient history return a service error; the endpoint does not fabricate estimates. Existing global app rate limiting remains in effect.

## Method and limitations

Pre-match team features use only previous results (last five appearances per team). The baseline trains a random-forest result classifier and goal regressors. The primary 1X2, double-chance, goal-line, BTTS and correct-score probabilities are derived from the same independent-Poisson score model, so related markets are internally consistent. The separate machine_learning_result field exposes the classifier's 1X2 probabilities for comparison rather than silently mixing incompatible model outputs.

Evaluation uses a chronological holdout. Before relying on results, add larger and more recent licensed data, probability calibration, season-by-season backtests, and ongoing monitoring. A single holdout or high accuracy score is not a guarantee of future performance.

The API returns form summaries, expected goals, top correct-score estimates, data-quality warnings and conservative confidence labels. Probabilities are estimates, not guarantees or financial advice.
