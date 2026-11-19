# Football Analytics ML Module

This optional Python module works alongside the ELISHA SPORTS BOT Node.js app. Node.js
handles chat and webhooks; Python validates historical data, builds analytical features,
trains the existing EPL model and evaluates its performance.

## Current data coverage

The repository currently contains seven EPL season CSV files, covering 2020/21 through
2026/27. The 2026/27 file is partial, not a completed season. At the time of the last
committed metadata update, data/dataset_metadata.json reported 2,380 rows from
2020-09-12 through 2026-11-08. Regenerate metadata after refreshing any season files.

The synthetic dataset is for deterministic tests only. It must never be treated as real
football history or used to support claims about model performance.

## Setup

Python 3.10+ is recommended. From this directory:

    python -m venv .venv
    # Linux/macOS: source .venv/bin/activate
    # Windows PowerShell: .venv\Scripts\Activate.ps1
    python -m pip install -r requirements.txt

## Existing EPL data workflow

    python prepare_epl_data.py
    python audit_data.py --data data/epl_historical.csv
    python train.py --data data/epl_historical.csv
    python evaluate.py --data data/epl_historical.csv
    python evaluate_walkforward.py --data data/epl_historical.csv
    pytest -q

Training is a separate operation. Runtime services load saved artifacts; they do not
retrain models for each request. Generated model files are ignored by Git and must be
created in each deployment environment.

For a pipeline smoke test only, use data/synthetic_matches.csv. Never interpret metrics
from synthetic data as evidence of real-world performance.

## Global multi-competition data foundation

GLOBAL_DATA_ARCHITECTURE.md describes the worldwide data model and staged rollout.
global_dataset.py validates the canonical global match CSV contract and produces a
per-competition coverage report:

    python global_dataset.py --data data/global_matches.csv
    python global_dataset.py --data data/global_matches.csv --output data/global_quality_report.json

The canonical format requires stable match, competition and team IDs, source attribution,
season, timestamp, completed status and final score. Optional statistics remain missing
when unavailable; missing values are not converted to zero.

This validator is intentionally separate from the existing EPL feature builder. Do not
combine other competitions into the EPL training file until identity mapping, feature
coverage and competition-aware evaluation have been implemented and reviewed.

## Data quality and provenance

Before training or publishing historical summaries, inspect the source CSV:

    python audit_data.py --data data/epl_historical.csv
    python audit_data.py --data data/epl_historical.csv --team "Arsenal" --as-of 2025-05-25 --limit 5

The audit reports accepted and rejected rows, invalid dates, missing scores, blank team
names, self-fixtures, duplicate fixture groups, date coverage and synthetic-data labels.
It cannot prove authenticity: verify the original provider, download, season completeness
and licence yourself.

## Optional newer-results CSV adapter

The repository does not ship provider credentials and this workflow is not live until a
suitable licensed source is configured and verified. Configure FOOTBALL_RESULTS_CSV_URL
to an HTTPS CSV export with normalized columns:

    match_date,home_team,away_team,home_goals,away_goals

The export must contain completed matches only and dates strictly newer than the bundled
EPL history. Review the provider's permitted use, then explicitly attest by setting
FOOTBALL_RESULTS_LICENSE_CONFIRMED=true. This is an operator attestation, not automated
legal verification.

    export FOOTBALL_RESULTS_CSV_URL="https://your-licensed-provider.example/results.csv"
    export FOOTBALL_RESULTS_LICENSE_CONFIRMED=true
    python fetch_matches.py --output data/provider_matches.csv
    python prepare_epl_data.py
    python audit_data.py --data data/epl_historical.csv

This is a configurable CSV adapter, not a named-provider integration or live-fixture API.
No source is configured by default. Never invent fixtures, injuries, suspensions, lineups
or live statistics. An HTTPS URL alone does not prove that data is licensed or authentic.

## Node.js integration

The app has an existing Python integration under the Node.js service layer. The new global
dataset validator is not yet wired into user-facing bot commands. That integration should
happen only after a real, licensed multi-competition dataset has been supplied and validated.

## Method and limitations

The existing EPL feature builder uses only earlier matches to calculate rolling team form,
home/away form, goals, rest days, Elo-style strength, head-to-head history and available
match statistics. Missing optional statistics are tracked separately from genuine zeroes.

Evaluation uses date-based holdouts and walk-forward folds. Keep all splits chronological:
future matches must never contribute to features for earlier matches. Report sample sizes,
date ranges, data freshness, missing-feature coverage and baseline comparisons alongside
every metric.

The current EPL model is not a worldwide model. Player identities, injuries, suspensions,
confirmed lineups and live news are not historical model inputs unless reliable, timestamped
records are collected and validated separately. The current football-data.org v4 adapter
also reports player availability, lineups and team-strength statistics as unsupported.
Do not present unavailable context as known.
