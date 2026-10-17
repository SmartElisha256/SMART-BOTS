# Running the imported project

The application remains in `elisha-sports-bot/` with its original Node.js/Express,
PostgreSQL, and Redis stack. The separate `football-analytics/` Python tools are
optional and are not required to run the bot.

## Development

Click **Run** to start the `Football bot` workflow, or run:

```sh
bash scripts/run-replit.sh
```

The script starts loopback-only Redis on port 6379, waits for readiness, and
starts the Express service on port 5000. Stopping the workflow stops both
processes. Redis persistence is disabled: it is only a development cache and
rate-limit store. PostgreSQL stores application records.

Dependencies are installed from `elisha-sports-bot/package-lock.json`:

```sh
cd elisha-sports-bot
npm ci
```

Replit development environment settings:

- `NODE_ENV=development`
- `PORT=5000`
- `REDIS_URL=redis://127.0.0.1:6379`
- `MESSAGING_PROVIDER=mock`
- `SPORTS_DATA_PROVIDER=mock`

The runtime supplies `DATABASE_URL`; never hardcode or print credentials.
The repository's schema was applied to the initially empty development
PostgreSQL database during setup. Do not run schema changes on every startup.

## Verification

The preview displays the existing JSON service response, not a chat interface.

- `/` — service identity
- `/health` — database health
- `/health/ready` — PostgreSQL and Redis readiness
- `/webhook` — WhatsApp webhook (POST for incoming messages)

```sh
cd elisha-sports-bot
npm test
npm run validate:env
npm run validate:messaging
```

## Before live use

Mock messaging accepts replies without delivering them. Mock sports responses
are sample data, not live football information. Real WhatsApp messaging requires
provider credentials and webhook setup; live data requires an API-Football key.
Configure sensitive values through Replit Secrets, never in committed files.

Development mode allows unsigned incoming webhook requests when no WhatsApp
app secret is set. Do not use this development configuration for public live
traffic. Configure production webhook verification and signatures first.
Manual payments also need verified merchant details and private administrator
numbers. The existing quota and price settings were not changed during import
setup; review them before launch. For production, configure a durable managed
Redis service instead of relying on the local development cache.
