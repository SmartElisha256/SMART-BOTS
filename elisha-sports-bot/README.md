# ELISHA SPORTS BOT

Node.js/Express starter for a WhatsApp football-information bot.

## Current status

- WhatsApp webhook verification and inbound text-message handling are implemented.
- Outbound messaging adapters: mock, CallMeBot, and WhatsApp Cloud API.
- PostgreSQL user/preferences/subscription storage and Redis caching/rate limiting are wired in.
- Sports data supports a mock provider and an API-Football provider. Mock remains the safe default; real results require `SPORTS_DATA_PROVIDER=api-football` and a valid `SPORTS_API_KEY`.
- `ANALYZE Team A vs Team B` compares recent form and head-to-head data. Set `OPENAI_API_KEY` to enable AI-written analysis; without it, the bot returns a statistics summary. AI output is evidence-based but not a guaranteed prediction.
- Real WhatsApp use requires valid Meta credentials and a publicly reachable HTTPS webhook.

## Requirements

- Node.js 20 or newer recommended
- Docker Compose (recommended for PostgreSQL and Redis)
- Meta WhatsApp Cloud API credentials for production WhatsApp messaging

## Start with Docker

From this folder (elisha-sports-bot), copy the example environment file:

    cp .env.example .env

Edit .env and set a long random WHATSAPP_WEBHOOK_VERIFY_TOKEN. For real WhatsApp messaging, also set MESSAGING_PROVIDER=whatsapp-cloud, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_APP_SECRET using values from your Meta app.

Start the services:

    docker compose up --build

Docker Compose starts PostgreSQL and Redis, initializes the schema on a new database volume, and waits for both services to be healthy before starting the app. If you already have a populated pgdata volume, Docker will not rerun the initialization script; apply src/database/schema.sql to that database manually.

Check the service:

    curl http://localhost:3000/
    curl http://localhost:3000/health
    curl http://localhost:3000/health/ready

## Run Node directly

If running Node on your computer instead of inside Docker, copy .env.example to .env and change the database and Redis hostnames from postgres and redis to localhost. Start PostgreSQL and Redis first, then run:

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

### Configure real football data and AI analysis

1. Create an API-Football account and obtain an API key from its official dashboard.
2. Set `SPORTS_DATA_PROVIDER=api-football`, `SPORTS_API_KEY`, `SPORTS_API_LEAGUE_ID` (default `39`, English Premier League), and `SPORTS_API_SEASON` in `.env`. API availability, leagues, and rate limits depend on your provider plan.
3. Optionally set `OPENAI_API_KEY` and `OPENAI_MODEL` to enable AI-written analysis. API usage may incur separate charges.
4. Restart the service and test `FIXTURES`, `LIVE`, `TABLE`, `FORM Arsenal`, `H2H Arsenal vs Liverpool`, and `ANALYZE Arsenal vs Liverpool`.

When `SPORTS_DATA_PROVIDER=mock`, fixture/table replies remain labeled as demo data. Do not use mock output for real-world decisions. The analysis does not guarantee match outcomes; missing data should be treated as unknown.

## WhatsApp webhook configuration

Set the Meta callback URL to https://YOUR_PUBLIC_HOST/webhook and use the same verify token in the Meta settings and .env. The endpoint supports Meta's GET verification challenge and POST message notifications. Production POST requests require a valid X-Hub-Signature-256 signature, so WHATSAPP_APP_SECRET must be set correctly.

Do not expose tokens, app secrets, or your .env file in GitHub. Only .env.example should be committed.

## Tests

    npm install
    npm test
    npm run validate:messaging

A GitHub Actions workflow is included to run tests and validate mock messaging configuration on changes to this project.
