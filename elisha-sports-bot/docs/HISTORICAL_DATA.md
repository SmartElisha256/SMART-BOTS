# Expanding historical training data

The Python module under `football-analytics/` ships with five EPL season CSVs (2020/21–2024/25). Those are **historical**, not live. To improve model quality:

## Recommended workflow

1. Obtain licensed match-level CSVs (columns at minimum: `match_date`, `home_team`, `away_team`, `home_goals`, `away_goals`). Optional: shots, shots on target, corners, fouls, cards.
2. Place files under `football-analytics/data/`.
3. Combine and normalize:

```bash
cd football-analytics
python prepare_epl_data.py          # or adapt for multi-league files
python audit_data.py --data data/epl_historical.csv
python train.py --data data/epl_historical.csv
python evaluate.py --data data/epl_historical.csv
```

4. Deploy only after chronological holdout evaluation looks reasonable. **Never** treat synthetic_matches.csv metrics as real performance.

## Multi-league notes

- API-Football can supply fixtures/standings for many leagues at runtime (see `leagueAliases.js`).
- The ML model still needs **match-level historical rows** for each league you want reliable probabilities for.
- Prefer separate models per competition if styles differ strongly (EPL vs Ligue 1).

## Licensing

Respect football-data.co.uk / API provider terms. Do not redistribute proprietary dumps in a public repo without permission.
