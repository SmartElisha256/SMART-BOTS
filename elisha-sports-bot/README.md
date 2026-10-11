# ELISHA SPORTS BOT

Node.js/Express starter for a WhatsApp football-information bot.

## Current status

- WhatsApp webhook verification and inbound text-message handling are implemented.
- Outbound messaging adapters: mock, CallMeBot, and WhatsApp Cloud API.
- PostgreSQL user/preferences/subscription storage and Redis caching/rate limiting are wired in.
- Daily Free/Premium request quotas are enforced for football-data commands. Free defaults to 20 requests/day; Premium defaults to 200 requests/day. Quotas reset at midnight Africa/Kampala time and are stored in PostgreSQL so they persist across restarts and app instances.
- Daily usage also records outgoing-message counts for basic WhatsApp usage monitoring. This counter is not a billing ledger and does not itself calculate Meta charges.
- Premium quota applies when a user's phone number has an active Premium subscription record. Payment collection and automatic payment verification/activation are not implemented yet; an administrator must verify payment and activate the subscription.
- Sports data supports a mock provider and an API-Football provider. Mock remains the safe default; real data requires `SPORTS_DATA_PROVIDER=api-football` and a valid `SPORTS_API_KEY`.
- Commands include upcoming fixtures, live scores, league tables, recent team form, and head-to-head records when the configured data provider supports them.
- Match summaries should clearly separate confirmed statistics from uncertainty. The bot is for football information and analysis, not betting recommendations or guarantees of match outcomes.
- Real WhatsApp use requires valid Meta credentials and a publicly reachable HTTPS webhook.

## Requirements

- Node.js 20 or newer recommended
- Docker Compose (recommended for PostgreSQL and Redis)
- Meta WhatsApp Cloud API credentials for production WhatsApp messaging

## Start with Docker

From this folder (`elisha-sports-bot`), copy the example environment file:

    cp .env.example .env

Edit `.env` and set a long random `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. For real WhatsApp messaging, also set `MESSAGING_PROVIDER=whatsapp-cloud`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_APP_SECRET` using values from your Meta app.

Start the services:

    docker compose up --build

Docker Compose starts PostgreSQL and Redis, initializes the schema on a new database volume, and waits for both services to be healthy before starting the app. If you already have a populated pgdata volume, Docker will not rerun the initialization script; apply the updated schema manually:

    docker compose exec -T postgres psql -U postgres -d elisha_sports_bot < src/database/schema.sql

Check the service:

    curl http://localhost:3000/
    curl http://localhost:3000/health
    curl http://localhost:3000/health/ready

## Run Node directly

If running Node on your computer instead of inside Docker, copy `.env.example` to `.env` and change the database and Redis hostnames from `postgres` and `redis` to `localhost`. Start PostgreSQL and Redis first, then run:

    npm install
    npm run dev

## Supported text commands

- MENU or HELP
- FIXTURES
- LIVE
- TABLE [LEAGUE]
- FORM TEAM
- H2H TEAM A vs TEAM B
- ANALYZE TEAM A vs TEAM B
- SEASON [LEAGUE] [YEAR]
- START and STOP for notification preferences

The daily quota counts data commands (FIXTURES, LIVE, TABLE, FORM, H2H, ANALYZE, and SEASON). MENU, HELP, START, STOP, and unknown commands do not consume the daily request allowance. Each incoming WhatsApp text message is still subject to the separate HTTP rate limiter at the webhook/server level.

## Configure daily quotas

In `.env`:

    FREE_DAILY_REQUEST_LIMIT=20
    PREMIUM_DAILY_REQUEST_LIMIT=200

Change the numbers to suit your capacity and WhatsApp budget. Quotas reset at midnight in `Africa/Kampala` time. The quota counter uses an atomic PostgreSQL UPSERT to prevent concurrent requests from bypassing the limit. If PostgreSQL is unavailable, quota checks fail closed for tracked commands rather than allowing unlimited usage.

When a Free user reaches the limit, the bot shows the used count and reset time and explains that Premium offers a higher limit. Premium activation is not self-service yet: payment verification and activating the subscription record still need to be implemented. Do not activate Premium solely because a user sends a message claiming to have paid.

## Configure real football data and optional AI summaries

1. Create an API-Football account and obtain an API key from its official dashboard.
2. In `.env`, set `SPORTS_DATA_PROVIDER=api-football`, `SPORTS_API_KEY`, `SPORTS_API_LEAGUE_ID` (default `39`, English Premier League), and `SPORTS_API_SEASON`. The competitions and request limits available depend on your API plan.
3. Optionally set `OPENAI_API_KEY` and `OPENAI_MODEL` for AI-written summaries. API usage may incur separate charges.
4. Restart the service and test `FIXTURES`, `LIVE`, `TABLE`, `FORM Arsenal`, and `H2H Arsenal vs Liverpool`.

Keep `SPORTS_DATA_PROVIDER=mock` while developing without a provider key. Mock fixtures and standings are demonstration data, not real-world results. Never commit real API keys, WhatsApp tokens, app secrets, or `.env` to GitHub.

## WhatsApp webhook configuration

Set the Meta callback URL to `https://YOUR_PUBLIC_HOST/webhook` and use the same verify token in the Meta settings and `.env`. The endpoint supports Meta's GET verification challenge and POST message notifications. Production POST requests require a valid `X-Hub-Signature-256` signature, so `WHATSAPP_APP_SECRET` must be set correctly.

## Tests

    npm install
    npm test
    npm run validate:messaging

A GitHub Actions workflow is included to run tests and validate mock messaging configuration on changes to this project.
