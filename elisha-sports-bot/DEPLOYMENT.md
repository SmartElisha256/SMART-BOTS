# ELISHA SPORTS BOT - Deployment Guide

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 6+
- Docker & Docker Compose (optional)

### Setup

1. Clone and install:

```bash
cd elisha-sports-bot
npm install
cp .env.example .env
```

2. Start PostgreSQL and Redis:

```bash
docker-compose up -d postgres redis
```

3. Initialize the database:

```bash
psql -h localhost -U postgres -d elisha_sports_bot < src/database/schema.sql
```

4. Start the API and background worker in separate terminals:

```bash
npm run dev
```

```bash
npm run worker
```

The API handles HTTP/webhook requests. The BullMQ worker consumes queued analysis and notification jobs. Both processes must run when Redis-backed jobs are enabled.

5. Test endpoints:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
```

### Running Tests

```bash
npm test
npm run test:commands
npm run test:sports
npm run test:messaging
```

## Production Deployment

### Environment Variables

All environment variables are documented in `.env.example`. Configure the database, Redis, environment, port, and credentials required by the integrations you enable. Production configuration is validated at startup.

### Database Initialization

Initialize the schema before starting the application:

```bash
psql "$DATABASE_URL" < src/database/schema.sql
```

For existing databases, apply migrations under `src/database/migrations/` that have not already been applied. The production API checks required tables and migration columns and intentionally blocks startup if required schema is missing.

### Docker Compose

Build and start the complete stack:

```bash
docker compose up -d --build
```

Compose runs separate processes:

- `app`: HTTP API and WhatsApp webhook
- `worker`: BullMQ background job consumer
- `postgres` and `redis`: persistent data and queue services

The API and worker use the same image and `.env` configuration but execute different npm scripts. Do not deploy only the `app` service when queue-backed work is enabled.

Inspect services and logs:

```bash
docker compose ps
docker compose logs --tail=100 app worker
```

### Non-Compose Hosts

Run the API and worker as independently supervised processes:

- API: `npm run start`
- Worker: `npm run worker`

Both processes require the same `DATABASE_URL` and `REDIS_URL`. Configure the host process manager to restart either process after an unexpected exit.

### Health and Readiness Checks

- `GET /health`: current process/database health endpoint
- `GET /health/ready`: checks database and, when configured, Redis connectivity

Use readiness for traffic gating. An API health response does not prove that the separate BullMQ worker is running; monitor the worker process and logs independently.

### Secrets Management

Never commit `.env` files to Git. Use the deployment platform's secret manager or protected environment variables. Production messaging uses the WhatsApp Cloud API (`MESSAGING_PROVIDER=whatsapp-cloud`).
