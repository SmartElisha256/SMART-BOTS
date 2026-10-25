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
