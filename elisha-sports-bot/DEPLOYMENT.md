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

4. Start the application:

```bash
npm run dev
```

5. Test the endpoints:

```bash
# Health check
curl http://localhost:3000/health

# Readiness probe
curl http://localhost:3000/health/ready
```

### Running Tests

```bash
# All tests
npm test

# Individual test suites
npm run test:commands
npm run test:sports
npm run test:messaging
```

## Production Deployment

### Environment Variables

All required environment variables are documented in `.env.example`. Set these before startup:

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `NODE_ENV=production`
- `PORT` - HTTP server port (default 3000)

**Optional (for integrations):**
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
- `MESSAGING_PROVIDER` (`mock` or `whatsapp-cloud`)
- `SPORTS_API_BASE_URL`, `SPORTS_API_KEY`
- `ADMIN_API_KEY`, `PAYMENT_ADMIN_PHONES`
- `OPENAI_API_KEY` (optional AI assistant)

### Database Initialization

The schema must be initialized once before the application starts:

```bash
psql $DATABASE_URL < src/database/schema.sql
```

For existing databases, also apply migrations under `src/database/migrations/` if not already applied.

### Startup Sequence

1. Environment variables are validated at startup (see `src/config/env.js`)
2. Database and Redis connections are tested
3. HTTP server starts on `PORT`
4. BullMQ worker starts if `REDIS_URL` is configured

### Health and Readiness Checks

For orchestration (Kubernetes, ECS, etc.):

- **Liveness probe:** `GET /health` - returns 200 if the process is running
- **Readiness probe:** `GET /health/ready` - returns 200 only if database and Redis are healthy

### Secrets Management

Never commit `.env` files to Git. Use `.gitignore` to exclude them. Production messaging uses **WhatsApp Cloud API** only (`MESSAGING_PROVIDER=whatsapp-cloud`).
