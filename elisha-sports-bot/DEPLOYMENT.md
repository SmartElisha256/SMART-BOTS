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
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `CALLMEBOT_API_KEY`, `CALLMEBOT_PHONE`
- `SPORTS_API_BASE_URL`, `SPORTS_API_KEY`

### Database Initialization

The schema must be initialized once before the application starts:

```bash
psql $DATABASE_URL < src/database/schema.sql
```

No migrations framework is required for the initial 100-user scale. For future schema changes, use a manual migration script or tool like `db-migrate` or `flyway`.

### Startup Sequence

1. Environment variables are validated at startup (see `src/config/env.js`)
2. Database and Redis connections are tested
3. HTTP server starts on `PORT`
4. BullMQ worker starts if `REDIS_URL` is configured

### Health and Readiness Checks

For orchestration (Kubernetes, ECS, etc.):

- **Liveness probe:** `GET /health` - returns 200 if the process is running
- **Readiness probe:** `GET /health/ready` - returns 200 only if database and Redis are healthy

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

### Graceful Shutdown

The application handles `SIGTERM` and `SIGINT` signals:

1. HTTP server stops accepting new requests
2. BullMQ worker completes in-flight jobs and gracefully closes
3. Database and Redis connections close
4. Process exits

Kubernetes `terminationGracePeriodSeconds` should be at least 30 seconds.

### Docker Deployment

1. Build the image:

```bash
docker build -t elisha-sports-bot:latest .
```

2. Run with Docker Compose (development):

```bash
docker-compose up
```

3. For production, use your orchestration platform (ECS, Kubernetes, etc.) with:
   - Environment variables from `.env`
   - Health checks configured as shown above
   - Proper storage for PostgreSQL and Redis (managed services recommended)

### Cloud Deployment Examples

#### AWS ECS

1. Push image to ECR
2. Create task definition with:
   - Environment variables from Secrets Manager or Parameter Store
   - Container port 3000
   - Health checks pointing to `/health/ready`
3. Create service with load balancer
4. Use RDS for PostgreSQL and ElastiCache for Redis

#### Heroku

```bash
heroku create elisha-sports-bot
heroku config:set DATABASE_URL=...
heroku config:set REDIS_URL=...
git push heroku main
```

#### DigitalOcean App Platform

1. Connect GitHub repository
2. Set environment variables
3. Configure PostgreSQL and Redis as add-ons
4. Deploy

## Configuration Recommendations for 100 Users

### PostgreSQL

- Connection pool: 5-10 connections (configured in `src/database/pool.js`)
- Shared buffers: 256MB for small instances
- Indexes created on frequently queried columns:
  - `users.phone`
  - `subscriptions.phone, is_active`
  - `message_events.phone, created_at`

### Redis

- Single node (no clustering needed at this scale)
- Memory: 256MB minimum
- Persistence: RDB snapshots every 5 minutes or AOF with fsync on write
- Key eviction policy: `allkeys-lru` or `volatile-lru`

### BullMQ

- Concurrency: 5 jobs at once (configurable via `JOB_CONCURRENCY`)
- Max attempts: 3 with exponential backoff
- Job retention: 24 hours for completed jobs, unlimited for failed jobs

### Caching

- Fixtures: 10 minutes (configurable via `CACHE_TTL_FIXTURES`)
- League table: 15 minutes (`CACHE_TTL_TABLE`)
- Team form: 30 minutes (`CACHE_TTL_FORM`)
- Live scores: 1 minute (hardcoded)

### Rate Limiting

- Default: 30 requests per 60 seconds per IP
- Configurable via `RATE_LIMIT_POINTS` and `RATE_LIMIT_DURATION`
- Per-user command rate limiting in service layer: 5 requests per 60 seconds

## Load Testing

### Plan for 5 RPS (Requests Per Second)

```bash
# Install k6 (load testing tool)
go install github.com/grafana/k6@latest

# Run the load test
k6 run load-test.js
```

See `LOAD_TEST.md` for the full load test script and results.

**Important:** This plan outlines the target. Actual performance has not been tested without running a dedicated load test with real infrastructure.

## Monitoring

Recommended metrics to track:

- HTTP request latency (p50, p95, p99)
- Database connection pool usage
- Redis memory usage
- BullMQ job queue depth and failure rate
- Application error rate
- Rate limit rejections

## Secrets Management

Never commit `.env` files to Git. Use `.gitignore` to exclude them:

```ignore
.env
.env.*
!.env.example
```

For production, use:
- **AWS:** Secrets Manager or Parameter Store
- **Heroku:** Config Vars
- **Kubernetes:** Secrets
- **Docker Swarm:** Secrets

## Rollback

If deployment fails:

1. Revert the Docker image or code to the last known good version
2. Keep database schema changes (they are backward compatible)
3. Restart the application

No data loss occurs because all state is stored in PostgreSQL and Redis.
