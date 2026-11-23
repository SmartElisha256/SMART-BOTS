# Model v7 fixes (from offline evaluation)

## Why v7
Deep gradient-boosting models over-fit ~1,600 EPL matches. Holdout accuracy sat near a home-win baseline with poor log loss.

## Changes
- Replace HGB with **regularised logistic regression (1X2)** and **Poisson GLM (goals)**.
- **Drop isotonic calibration** when it worsens log loss on the calibration window.
- Fit Dixon–Coles rho only on the calibration window; never on the holdout.
- Report against uniform, base-rate, and bookmaker baselines when odds columns exist.

## Reported holdout (EPL, late 2025 → early Nov 2026)
- 1X2 accuracy ~45.2%
- Log loss ~1.04
- Balanced accuracy ~42.1%

These are estimates, not betting guarantees. Retrain on the server after pulling this branch:
```bash
cd elisha-sports-bot/football-analytics
python3 prepare_epl_data.py
python3 train.py
```
