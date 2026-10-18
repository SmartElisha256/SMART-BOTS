# Running ELISHA SPORTS BOT on Replit

The `Start application` workflow starts the Node.js API on port 5000, a local
Redis service, and the project's mock sports and messaging providers. Replit's
managed PostgreSQL database stores user, subscription, usage, and payment data.
This lets you run the service in Preview without WhatsApp credentials or live
sports API access.

The launch script starts Redis bound to localhost for caching and rate limits;
its data is temporary and clears when the workflow stops. Durable bot records
are stored in PostgreSQL. The root endpoint (`/`) returns the service status,
and `/health/ready` checks PostgreSQL and Redis.

For a full setup, follow `elisha-sports-bot/README.md` and
`elisha-sports-bot/DEPLOYMENT.md`. Keep WhatsApp, sports API, and payment
administrator settings in Replit Secrets; do not commit them to the repository.
