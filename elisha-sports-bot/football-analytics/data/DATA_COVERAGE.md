# Historical match data coverage

Bundled CSV seasons (English Premier League, football-data.co.uk style):

| File | Season |
|------|--------|
| `epl_2020_21.csv` | 2020/21 |
| `epl_2021_22.csv` | 2021/22 |
| `epl_2022_23.csv` | 2022/23 |
| `epl_2023_24.csv` | 2023/24 |
| `epl_2024_25.csv` | 2024/25 |
| `epl_2025_26.csv` | 2025/26 (optional — add when available) |

This is **not** automatically current for unfinished seasons or the live calendar.

## Update workflow

```bash
cd elisha-sports-bot/football-analytics
# Optional licensed HTTPS CSV (requires FOOTBALL_RESULTS_CSV_URL + FOOTBALL_RESULTS_LICENSE_CONFIRMED=true)
python3 fetch_matches.py
# Rebuild normalized history (discovers all epl_YYYY_YY.csv present)
python3 prepare_epl_data.py
# Or one shot:
python3 update_pipeline.py --train --evaluate
```

`synthetic_matches.csv` and `unit_test_historical_mini.csv` are for tests only.
`train.py` refuses synthetic rows.
