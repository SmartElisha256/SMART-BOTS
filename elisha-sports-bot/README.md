# ELISHA SPORTS BOT

Node.js/Express starter for a WhatsApp football-information bot.

## Current status

- WhatsApp webhook verification and inbound text-message handling are implemented.
- Outbound messaging adapters: mock, CallMeBot, and WhatsApp Cloud API.
- PostgreSQL user/preferences/subscription storage and Redis caching/rate limiting are wired in.
- Sports data is still mock/demo data. A real football API provider has not been implemented. Sample fixtures and standings are labeled as demo data; real live scores, form, and head-to-head data are not available yet.
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

Commands that depend on real football data will not produce real results until a real sports-data provider is implemented and configured. The current sample table and sample fixtures are explicitly labeled as demo data.

## WhatsApp webhook configuration

Set the Meta callback URL to https://YOUR_PUBLIC_HOST/webhook and use the same verify token in the Meta settings and .env. The endpoint supports Meta's GET verification challenge and POST message notifications. Production POST requests require a valid X-Hub-Signature-256 signature, so WHATSAPP_APP_SECRET must be set correctly.

Do not expose tokens, app secrets, or your .env file in GitHub. Only .env.example should be committed.

## Tests

    npm install
    npm test
    npm run validate:messaging

A GitHub Actions workflow is included to run tests and validate mock messaging configuration on changes to this project.
