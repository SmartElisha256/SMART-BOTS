# ELISHA SPORTS BOT

A modular Node.js WhatsApp football bot built for automated match updates, subscription management, and sports information delivery.

## Features

- Express HTTP server with health checks and webhook endpoint
- PostgreSQL storage for users and subscriptions
- Redis + BullMQ queue for background jobs and rate limiting
- Messaging abstraction for CallMeBot, WhatsApp Cloud API, and a mock provider
- Mock sports data provider for local development without external API keys
- Structured logging, validation with Zod, error handling, and graceful shutdown
- Automated tests for bot commands and sports fixtures

## Project structure

```text
elisha-sports-bot/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   └── env.js
│   ├── routes/
│   │   ├── health.js
│   │   └── webhook.js
│   ├── controllers/
│   │   └── webhookController.js
│   ├── services/
│   │   ├── commandService.js
│   │   ├── sportsService.js
│   │   ├── subscriptionService.js
│   │   └── userService.js
│   ├── providers/
│   │   ├── messaging/
│   │   │   ├── messagingProvider.js
│   │   │   ├── callmebotProvider.js
│   │   │   ├── mockMessagingProvider.js
│   │   │   └── whatsappCloudProvider.js
│   │   └── sports/
│   │       ├── mockSportsProvider.js
│   │       ├── sportsDataProvider.js
│   │       └── sportsDataProvider.js
│   ├── jobs/
│   │   ├── queue.js
│   │   └── worker.js
│   ├── middleware/
│   │   ├── errorHandler.js
│   │   └── rateLimiter.js
│   ├── database/
│   │   ├── pool.js
│   │   └── schema.sql
│   ├── utils/
│   │   ├── logger.js
│   │   └── messageDeduplication.js
│   └── tests/
│       ├── commands.test.js
│       └── sports.test.js
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
└── src/
```

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

## Environment notes

- PostgreSQL and Redis are required for full production behavior. Docker Compose includes both.
- The app can run in a mocked state without paid sports APIs by using the built-in mock sports provider.
- CallMeBot is not a general public inbound WhatsApp platform; it is limited to explicit outbound messaging setup and does not support arbitrary public inbound messaging to all users. This project does not assume unsupported behavior.
- WhatsApp Cloud API credentials and webhook verification tokens require external setup from Meta.

## Deployment

```bash
npm run prod
```

## Testing

```bash
npm test
```

## External setup required

- PostgreSQL database and Redis service
- WhatsApp Business / Cloud API credentials for production messaging
- Optional sports API keys if swapping the mock provider for a real live provider
- CallMeBot credentials only if using that provider

## TODO

- Replace `.env` credentials with real values for production use.
- Add actual database migrations if your team prefers migration-based schema management.
- Replace the mock sports provider with a real provider when live data is required.
