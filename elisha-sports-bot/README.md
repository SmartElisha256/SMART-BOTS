# ELISHA SPORTS BOT

Node.js/Express starter for a WhatsApp football-information bot.

## Current status

- WhatsApp webhook verification and inbound text-message handling are implemented.
- Outbound messaging adapters: mock, CallMeBot, and WhatsApp Cloud API.
- PostgreSQL user/preferences/subscription storage and Redis caching/rate limiting are wired in.
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

Docker Compose starts PostgreSQL and Redis, initializes the schema on a new database volume, and waits for both services to be healthy before starting the app. If you already have a populated pgdata volume, Docker will not rerun the initialization script; apply `src/database/schema.sql` to that database manually.

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
- START and STOP for notification preferences

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
