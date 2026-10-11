# ELISHA SPORTS BOT

Node.js/Express WhatsApp football-information bot for fixtures, live scores, standings, team form, head-to-head records, and factual match analysis.

## Current features

- WhatsApp webhook verification and inbound text/image message handling.
- Outbound messaging adapters: mock, CallMeBot, and WhatsApp Cloud API.
- PostgreSQL user, subscription, daily usage, sports cache, and manual payment records; Redis caching/rate limiting.
- Daily quotas default to 20 Free and 200 Premium football-data requests, resetting at midnight Africa/Kampala time.
- Mock sports data for development and API-Football for live data when configured.
- Manual Airtel Money Premium proof submission. Premium is never activated just because a user sends a receipt; an administrator must verify the merchant transaction and approve the reference.
- This bot provides football information and analysis. It is not a betting recommendation service and does not guarantee match outcomes.

## Requirements

- Node.js 20 or newer recommended (Node 18 minimum)
- Docker Compose recommended for PostgreSQL and Redis
- Meta WhatsApp Cloud API credentials and a publicly reachable HTTPS webhook for production

## Start

From this folder, copy .env.example to .env and set a strong webhook verify token:

    cp .env.example .env

For real WhatsApp, set MESSAGING_PROVIDER=whatsapp-cloud, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, and WHATSAPP_WEBHOOK_VERIFY_TOKEN. Never commit .env, access tokens, app secrets, or administrator phone numbers.

Set the payment values in the private deployment environment:
- PREMIUM_PRICE_UGX=5000
- MOMO_NETWORK=Airtel Money
- MOMO_MERCHANT_CODE to the merchant code verified in the official payment screen/account
- MOMO_MERCHANT_NAME=SMART ELISHA 256
- PAYMENT_ADMIN_PHONES to comma-separated admin numbers in international digits, e.g. 2567XXXXXXXX

Start services:

    docker compose up --build

Docker Compose initializes the database schema when the PostgreSQL data volume is first created. For an existing database, apply the idempotent schema file to add the manual-payment table/indexes:

    docker compose exec -T postgres psql -U postgres -d elisha_sports_bot < src/database/schema.sql

Check health:

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
- ANALYZE TEAM A vs TEAM B
- SEASON [LEAGUE] [YEAR]
- START and STOP for notification preferences

## Manual Premium payment flow

1. The user sends PREMIUM or UPGRADE to receive the configured price and merchant instructions.
2. For Airtel Money Pay, the bot tells the customer to dial *185*9# and follow the prompts. The customer must confirm the displayed merchant/business name and amount before entering their PIN.
3. The user sends PAY TRANSACTION_ID, or submits a receipt image. Both are recorded as pending proof.
4. The bot notifies the configured administrator(s). On WhatsApp Cloud API, receipt images are relayed to the administrator by media ID when supported by Meta.
5. An administrator checks the real merchant account first, then sends APPROVE REFERENCE to activate Premium or REJECT REFERENCE to decline the proof. Other users cannot approve or reject.
6. Repeated transaction IDs and screenshot media IDs are prevented from creating duplicate requests. An approval and Premium subscription activation are committed together in PostgreSQL.

Important: A screenshot or transaction ID is not proof that funds arrived. Verify the payment in the merchant account before approval. Never ask users for PINs or OTPs. The merchant code in configuration must be verified against the official merchant account and the name shown before any payment is accepted.

## Data and optional AI

Set SPORTS_DATA_PROVIDER=api-football and a valid SPORTS_API_KEY to use real football data. Keep SPORTS_DATA_PROVIDER=mock during local development. Optionally configure OPENAI_API_KEY for summaries; API use may cost extra. Provider coverage and request limits depend on the provider plan.

## Tests

    npm install
    npm test
    npm run validate:messaging
    npm run validate:env
