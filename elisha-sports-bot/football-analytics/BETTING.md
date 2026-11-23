# Betting assistant (v8): value checks, staking and paper trading

**Read this first.** Walk-forward backtests on this repo's own data show the model has **no proven edge** over bookmaker odds.
This module is a *research and discipline tool*. It never places bets. Use it in paper mode and let the numbers decide.

## WhatsApp product path
Premium command:
```text
VALUE Home vs Away 1.80 3.90 4.60 [BANKROLL 1000]
```
Odds order: home, draw, away (decimal). PASS is the normal outcome.

## CLI research
```bash
python3 bet.py suggest --home Arsenal --away Chelsea \
  --odds 1.80 3.90 4.60 --bankroll 1000 --log
python3 bet.py report --bankroll 1000
python3 backtest_value.py
```

## Rules (BettingConfig)
- Blend: 30% model + 70% market
- Edge ≥ 2 pts, EV ≥ +4%, odds 1.40–6.00
- Fractional Kelly 20%, max 2% stake, 8% open exposure

## Backtest takeaway (EPL sample in source analysis)
Model weight 0 (market only) had better log loss than higher model weights.
Default rules were not a reliable positive yield. Line shopping mattered more than the model.

## Not included
Automatic bet placement. Bookmaker sites forbid bots; there is no demonstrated edge.
