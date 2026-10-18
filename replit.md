# Running ELISHA SPORTS BOT on Replit

The `Start application` workflow starts the Node.js API on port 5000 with the
project's mock sports and messaging providers. This lets you open the service
in Replit Preview without WhatsApp credentials or live sports API access.

This preview runs in `NODE_ENV=test` so the process does not require a local
PostgreSQL or Redis service just to start. The root endpoint (`/`) should return
the service status. Bot commands that read or write user, subscription, or
payment data need PostgreSQL and Redis configured; the health checks report
degraded readiness until those services are available.

For a full setup, follow `elisha-sports-bot/README.md` and
`elisha-sports-bot/DEPLOYMENT.md`. Keep WhatsApp, sports API, and payment
administrator settings in Replit Secrets; do not commit them to the repository.
