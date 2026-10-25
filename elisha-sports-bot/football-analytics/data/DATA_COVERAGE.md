# Historical match data coverage

Bundled CSV seasons (English Premier League, football-data.co.uk style):

| File | Season |
|------|--------|
| `epl_2020_21.csv` | 2020/21 |
| `epl_2021_22.csv` | 2021/22 |
| `epl_2022_23.csv` | 2022/23 |
| `epl_2023_24.csv` | 2023/24 |
| `epl_2024_25.csv` | 2024/25 |

This is **not** automatically current for the 2025/26 or 2026 calendar season.
Run `prepare_epl_data.py` after adding new season files, then retrain with `train.py`.

`synthetic_matches.csv` and `unit_test_historical_mini.csv` are for tests only.
`train.py` refuses synthetic-only training.


## Current-data status and provider setup

Bundled history ends in 2024/25. There is no provider URL, API key, or licensed current-season feed configured in the repository by default. To append newer completed results, configure the optional workflow documented in `../README.md`; it writes a separate `provider_matches.csv`, records a freshness manifest, and only includes provider rows strictly newer than the bundled date range. Predictions must expose stale-data warnings when the latest available result is too old for the requested cutoff. A provider update is not verified until its source, licence, coverage, and resulting date range have been checked.
