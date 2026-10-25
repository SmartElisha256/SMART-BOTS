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
    python evaluate_walkforward.py --data data/epl_historical.csv
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

## Optional newer-results provider workflow (not enabled by default)

The repository does not ship provider credentials and this workflow is **not live until you configure and verify a suitable licensed source**. Configure `FOOTBALL_RESULTS_CSV_URL` to an HTTPS CSV export with normalized columns `match_date,home_team,away_team,home_goals,away_goals`. The export must contain completed matches only and only dates strictly newer than the bundled EPL history. The operator must review commercial-use/licensing terms, then explicitly attest by setting `FOOTBALL_RESULTS_LICENSE_CONFIRMED=true`; this is not an automated legal check.

    export FOOTBALL_RESULTS_CSV_URL="https://your-licensed-provider.example/results.csv"
    export FOOTBALL_RESULTS_LICENSE_CONFIRMED=true
    python fetch_matches.py --output data/provider_matches.csv
    python prepare_epl_data.py
    python audit_data.py --data data/epl_historical.csv
    python train.py --data data/epl_historical.csv
    python evaluate.py --data data/epl_historical.csv
    python evaluate_walkforward.py --data data/epl_historical.csv

The fetcher validates the schema, dates, team names, scores, duplicate fixtures and freshness before replacing `data/provider_matches.csv`. Failed downloads or validation leave the previous provider file untouched. A manifest records the provider host, update timestamp, match date range, freshness age and SHA-256; it deliberately does not save URL query credentials. The preparation step refuses provider rows that overlap the bundled date range and atomically preserves the last known good combined dataset if validation fails.

This is a configurable CSV adapter, not a named-provider integration or live-fixture API. No source is configured in this repository by default. Never invent fixtures, injuries, suspensions, lineups or live statistics. Review the provider licence and coverage yourself; an HTTPS URL alone does not prove that data is licensed or authentic.

## Node.js endpoint

The app exposes POST /api/football-ml/predict. JSON body:

    {"home_team":"Example FC","away_team":"Sample United","kickoff":"2027-01-12T15:00:00Z"}

It runs predict.py as a separate process with a timeout. Train models first and configure Python via PYTHON_BIN if needed. Missing models or insufficient history return a service error; the endpoint does not fabricate estimates. Existing global app rate limiting remains in effect.

## Method and limitations

Pre-match model features use only earlier matches (rolling last-five appearances per team): points/form, goals for and against, match counts, rest days, and rolling shots, shots on target, corners, fouls, yellow cards and red cards where those columns exist in the historical source. Per-feature coverage counts distinguish missing statistics from genuine zero averages. The preparation script preserves these optional columns from football-data.co.uk files. The baseline trains a random-forest result classifier and goal regressors. The primary 1X2, double-chance, goal-line, BTTS and correct-score probabilities are derived from the same independent-Poisson score model, so related markets are internally consistent. The separate machine_learning_result field exposes the classifier's 1X2 probabilities for comparison rather than silently mixing incompatible model outputs.

Evaluation reports a strict date-based holdout and season-style walk-forward folds, with sample sizes, date ranges, accuracy, balanced accuracy, log loss, multiclass Brier score, top-label calibration bins, goal MAE and a training-only majority-class baseline. The split helper rejects overlapping or non-chronological train/test dates. A single holdout or high accuracy score is not a guarantee of future performance; the holdout metrics printed by training are diagnostic and must not be described as an independent final test after the model is refit on all rows.

The API returns the feature list, historical date range, optional-stat coverage, form summaries, expected goals, top correct-score estimates, data-quality warnings and conservative confidence labels. Important: the model does not directly train on player identities, injuries, suspensions, confirmed lineups or live news because the committed historical training CSVs do not contain reliable per-player match features. The separate match-context layer attempts to retrieve squad availability, lineups and team-strength information for the AI explanation; each field must be marked unavailable if no provider data is found. Do not describe these contextual signals as model inputs. The five committed EPL seasons end in 2024/25; this is historical data, not live 2026 data. To include current seasons, add licensed current match data, run the preparation/training workflow, then evaluate it chronologically before trusting it. Probabilities are estimates, not guarantees or financial advice.
