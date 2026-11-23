# Multiple leagues and weekly refresh (v9)

## What is supported
| Key | League | Source code |
|---|---|---|
| `epl` | Premier League (already in the repo) | E0 |
| `laliga` | La Liga | SP1 |
| `bundesliga` | Bundesliga | D1 |
| `seriea` | Serie A | I1 |
| `ligue1` | Ligue 1 | F1 |
| `championship`, `eredivisie`, `primeira` | optional, off by default | E1, N1, P1 |

Each league has its **own** ratings and models (Elo ratings are not comparable across leagues).
Premier League files keep their old locations; others use `data/<key>_YYYY_YY.csv`, `data/<key>_historical.csv` and `models/<key>/`.

**Not supported:** the Champions League, Europa League and international matches. They need cross-league ratings and a data source
that football-data.co.uk does not provide. The bot answers such fixtures with "no cross-league model" instead of guessing.

## First run for the new leagues
Needs internet access on your server and your own check of the data terms (a paid subscription is commercial use):
```bash
cd elisha-sports-bot/football-analytics
export FOOTBALL_DATA_LICENSE_CONFIRMED=true    # your attestation that you may use the data this way
python3 refresh.py --backfill 6                # downloads ~6 seasons per league, trains, runs the safety gate
```
Check the JSON report: each league should say `updated` and show `log_loss` next to `base_rate_log_loss` and `market_log_loss`.
Do not sell a league until you have looked at those numbers.

## Weekly refresh
```cron
0 5 * * 1  cd /path/to/elisha-sports-bot/football-analytics && FOOTBALL_DATA_LICENSE_CONFIRMED=true python3 refresh.py
```

## Safety notes
- Historical CSVs for non-EPL leagues are **not** shipped in git (see `.gitignore`).
- Trained model weights stay gitignored; train on the server.
- Betting / tip-staking helpers from experimental zips are **not** included in this product path.
