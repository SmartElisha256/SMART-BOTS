import { createApp } from './app.js';
import { env } from './config/env.js';
import pool, { testDatabaseConnection } from './database/pool.js';
import { logger } from './utils/logger.js';

const app = createApp();
let server;

async function verifyPersistentStorage() {
  // Premium status and payment requests must survive process restarts in production.
  // Do not silently run with the in-memory subscription/payment fallbacks there.
  if (!process.env.DATABASE_URL || !pool) {
    throw new Error('Production requires DATABASE_URL for persistent subscriptions and payment records.');
  }

  const connection = await testDatabaseConnection();
  if (!connection.ok) {
    throw new Error('Production database check failed: ' + connection.message);
  }

  const result = await pool.query(
    "SELECT to_regclass('public.subscriptions') AS subscriptions, to_regclass('public.manual_payment_requests') AS payments"
  );
  if (!result.rows[0]?.subscriptions || !result.rows[0]?.payments) {
    throw new Error(
      'Production database is connected but required tables are missing. Apply src/database/schema.sql before starting the bot.'
    );
  }
}

async function startServer() {
  if (env.NODE_ENV === 'production') {
    await verifyPersistentStorage();
    logger.info('Persistent subscription and payment storage verified');
  }

  server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'ELISHA SPORTS BOT listening');
  });
  return server;
}

const gracefulShutdown = (signal) => {
  logger.warn({ signal }, 'Received shutdown signal');
  if (!server) {
    process.exit(0);
    return;
  }
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

try {
  await startServer();
} catch (error) {
  logger.fatal({ error }, 'ELISHA SPORTS BOT startup blocked');
  process.exitCode = 1;
}

export default server;
