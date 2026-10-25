# ELISHA SPORTS BOT

Node.js/Express WhatsApp football-information bot for fixtures, live scores, standings, team form, head-to-head records, and factual match analysis.

## Features
- WhatsApp text webhook, with mock and WhatsApp Cloud API messaging adapters.
- PostgreSQL users, subscriptions, daily usage, sports cache, and manual payment records; Redis caching/rate limiting.
- Daily quotas default to 20 Free and 200 Premium football-information requests, resetting at midnight Africa/Kampala time. Premium also has a separate 300-request monthly cap; the first limit reached applies.
- Mock sports data for development and API-Football for live data when configured.
- Manual Airtel Money Premium payment by transaction ID only. An administrator must verify the transaction before access is activated.
- This bot provides football information and factual analysis, not betting recommendations or guaranteed outcomes.

## Configure
Copy .env.example to .env. Never commit real tokens, app secrets, .env, or administrator phone numbers.

Set `MESSAGING_PROVIDER` to `mock` (local development) or `whatsapp-cloud` (production).

## Run
```bash
npm install
npm start
```

See `DEPLOYMENT.md` for production setup.
