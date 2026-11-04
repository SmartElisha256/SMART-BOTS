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

## Columns the bot uses

### Mandatory (season CSV must include these)

| Column | Meaning |
|--------|---------|
| `Date` | Match date (`DD/MM/YYYY`) — needed for chronological features |
| `HomeTeam` | Home team name |
| `AwayTeam` | Away team name |
| `FTHG` | Full-time home goals |
| `FTAG` | Full-time away goals |

Without these five, `prepare_epl_data.py` rejects the file.

### Optional extras (shots / corners / fouls / cards)

Used when present to enrich rolling form features; safe to omit:

| Column | Meaning |
|--------|---------|
| `HS` / `AS` | Home / away shots |
| `HST` / `AST` | Home / away shots on target |
| `HC` / `AC` | Home / away corners |
| `HF` / `AF` | Home / away fouls |
| `HY` / `AY` | Home / away yellow cards |
| `HR` / `AR` | Home / away red cards |

### Not used by the bot

Odds columns (`B365*`, `PS*`, Asian handicap, over/under, etc.), half-time scores (`HTHG`, `HTAG`, `HTR`), `Div`, `Time`, and `Referee` are ignored by train/predict.

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
