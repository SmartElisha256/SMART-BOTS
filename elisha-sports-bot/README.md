# ELISHA SPORTS BOT

Node.js/Express WhatsApp football-information bot for fixtures, live scores, standings, team form, head-to-head records, and factual match analysis.

## Features
- WhatsApp text webhook, with mock, CallMeBot, and WhatsApp Cloud API messaging adapters.
- PostgreSQL users, subscriptions, daily usage, sports cache, and manual payment records; Redis caching/rate limiting.
- Daily quotas default to 20 Free and 200 Premium football-information requests, resetting at midnight Africa/Kampala time. Premium also has a separate 300-request monthly cap; the first limit reached applies.\n- New users can try up to 3 Premium match analyses during their first 24 hours; historical season reports remain Premium-only.
- Mock sports data for development and API-Football for live data when configured.
- Manual Airtel Money Premium payment by transaction ID only. An administrator must verify the transaction before access is activated.
- This bot provides football information and factual analysis, not betting recommendations or guaranteed outcomes.

## Configure
Copy .env.example to .env. Never commit real tokens, app secrets, .env, or administrator phone numbers.

Suggested Premium prices:
- PREMIUM_PRICE_DAY_UGX=1000 — 1 day
- PREMIUM_PRICE_WEEK_UGX=5000 — 7 days
- PREMIUM_PRICE_MONTH_UGX=15000 — 30 days
- MOMO_NETWORK=Airtel Money
- MOMO_MERCHANT_CODE=6949337
- MOMO_MERCHANT_NAME=SMART ELISHA 256
- PAYMENT_ADMIN_PHONES — configure privately using international digits

The day and month prices are suggested tiers; confirm them before launch. Verify the displayed merchant name and amount in Airtel's payment flow.

## Start
    docker compose up --build

For an existing PostgreSQL database, apply the idempotent schema/migration file from this folder:
    docker compose exec -T postgres psql -U postgres -d elisha_sports_bot < src/database/schema.sql

Health checks:
    curl http://localhost:3000/
    curl http://localhost:3000/health
    curl http://localhost:3000/health/ready

## Football commands
- MENU or HELP
- FIXTURES
- LIVE
- TABLE [LEAGUE]
- FORM TEAM
- H2H TEAM A vs TEAM B
- ANALYZE TEAM A vs TEAM B (Premium only)
- SEASON [LEAGUE] [YEAR] (Premium only)
- START and STOP for notification preferences

## Premium access and quotas
- `ANALYZE` / `ANALYSIS` require an active, unexpired Premium subscription, except new accounts receive up to 3 trial analyses during the first 24 hours after account creation.\n- `SEASON` / `HISTORICAL` always require an active Premium subscription and are not included in the trial.
- Free defaults: 20 football-data requests per Kampala day. Premium defaults: 200 per day and 300 per Kampala calendar month. The monthly cap is a hard ceiling, so a Premium user can make at most 300 tracked requests in a month even if the daily allowance is higher.
- Trial defaults: `NEW_USER_TRIAL_HOURS=24` and `NEW_USER_TRIAL_ANALYSIS_LIMIT=3`. Trial eligibility is tied to the account creation timestamp and cannot be restarted by returning users.\n- Override quotas only through `FREE_DAILY_REQUEST_LIMIT`, `PREMIUM_DAILY_REQUEST_LIMIT`, `PREMIUM_MONTHLY_REQUEST_LIMIT`, `NEW_USER_TRIAL_HOURS`, and `NEW_USER_TRIAL_ANALYSIS_LIMIT`. Keep README, `.env.example`, and hosting settings aligned.
- Help/menu and payment commands remain available when football-data quota is exhausted.

## Manual Premium payment
1. Send PREMIUM or UPGRADE to see the prices and merchant details.
2. For Airtel Money Pay, dial *185*9# and follow the prompts. Confirm the displayed business name and exact amount before entering your PIN.
3. Submit transaction ID only: PAY DAY TRANSACTION_ID, PAY WEEK TRANSACTION_ID, or PAY MONTH TRANSACTION_ID. PAY TRANSACTION_ID defaults to the weekly plan.
4. The bot creates a pending request and notifies configured administrators.
5. An administrator verifies the transaction in the merchant account, then sends APPROVE REFERENCE or REJECT REFERENCE.
6. Approval grants 1, 7, or 30 days. Renewals extend from the current expiry when still active.

A transaction ID alone does not prove funds arrived. Verify the real merchant transaction before approval. Never ask users for PINs or OTPs. The merchant code is the supplied business code; verify the displayed business name and amount before launch.

## Data and tests
Set SPORTS_DATA_PROVIDER=api-football and a valid SPORTS_API_KEY for live data; use mock for development.

    npm install
    npm test
    npm run validate:messaging
    npm run validate:env
