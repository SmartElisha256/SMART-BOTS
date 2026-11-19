# Historical match data coverage

Bundled CSV seasons (English Premier League, football-data.co.uk style):

| File | Season | Coverage |
|------|--------|----------|
| epl_2020_21.csv | 2020/21 | Historical season |
| epl_2021_22.csv | 2021/22 | Historical season |
| epl_2022_23.csv | 2022/23 | Historical season |
| epl_2023_24.csv | 2023/24 | Historical season |
| epl_2024_25.csv | 2024/25 | Historical season |
| epl_2025_26.csv | 2025/26 | Historical season |
| epl_2026_27.csv | 2026/27 | Partial season; not complete |

The last committed data/dataset_metadata.json reports 2,380 combined records from
2020-09-12 through 2026-11-08. This count and date range describe that metadata snapshot;
regenerate the metadata after any refresh. The data is historical and is not a live feed.

## Columns used by the existing EPL pipeline

### Mandatory season CSV columns

| Column | Meaning |
|---------|---------|
| Date | Match date (DD/MM/YYYY) |
| HomeTeam | Home team name |
| AwayTeam | Away team name |
| FTHG | Full-time home goals |
| FTAG | Full-time away goals |

### Optional match statistics

| Column | Meaning |
|---------|---------|
| HS / AS | Home / away shots |
| HST / AST | Home / away shots on target |
| HC / AC | Home / away corners |
| HF / AF | Home / away fouls |
| HY / AY | Home / away yellow cards |
| HR / AR | Home / away red cards |

Optional statistics are not guaranteed to be present for every competition or season.
Missing values must remain missing and must not be interpreted as zero.

## Global data foundation

The new global_dataset.py validator uses a separate canonical schema for multi-competition
imports. It requires stable match, competition and team IDs, source, season, timestamp,
completed status and final score. It also checks duplicate IDs, duplicate fixtures,
synthetic rows, invalid scores and optional-stat coverage.

See GLOBAL_DATA_ARCHITECTURE.md for the schema and staged rollout. The global dataset is
not automatically merged into the existing EPL model.

## Update workflow

    cd elisha-sports-bot/football-analytics
    python3 prepare_epl_data.py
    python3 audit_data.py --data data/epl_historical.csv
    python3 update_pipeline.py --train --evaluate

The optional provider CSV fetcher requires FOOTBALL_RESULTS_CSV_URL and
FOOTBALL_RESULTS_LICENSE_CONFIRMED=true. It is a generic HTTPS CSV adapter, not a named
provider integration. Verify the source, licence, completeness and date coverage yourself.

synthetic_matches.csv and unit_test_historical_mini.csv are for tests only.
train.py refuses synthetic rows.
