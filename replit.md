# Running ELISHA SPORTS BOT on Replit

The `Start application` workflow starts the Node.js API on port 5000, a local
Redis service, and the project's mock sports and messaging providers. Replit's
managed PostgreSQL database stores user, subscription, usage, and payment data.
This lets you run the service in Preview without WhatsApp credentials or live
sports API access.

When no `REDIS_URL` is configured, the launch script starts Redis bound to
localhost with append-only persistence under the runner's home directory, so
rate-limit counters survive workflow restarts. For a published deployment, set
`REDIS_URL` as a Replit Secret to a managed Redis service with persistence
enabled; deployment filesystems are not durable. Production startup requires an
explicit `REDIS_URL`. Never commit the Redis connection string.

Durable bot records are stored in PostgreSQL. The root endpoint (`/`) returns
the service status, and `/health/ready` checks PostgreSQL and Redis.

For a full setup, follow `elisha-sports-bot/README.md` and
`elisha-sports-bot/DEPLOYMENT.md`. Keep WhatsApp, sports API, and payment
administrator settings in Replit Secrets; do not commit them to the repository.
