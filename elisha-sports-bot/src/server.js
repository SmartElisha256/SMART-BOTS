import { createApp } from './app.js';
import { env, validateEnvironment } from './config/env.js';
import pool, { testDatabaseConnection } from './database/pool.js';
import { logger } from './utils/logger.js';
import { ensureExpiryReminderSchedule } from './jobs/queue.js';

const app = createApp();
let server;

async function verifyPersistentStorage() {
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

  const webhookDedupeTable = await pool.query(
    "SELECT to_regclass('public.whatsapp_webhook_messages') AS table_name"
  );
  if (!webhookDedupeTable.rows[0]?.table_name) {
    throw new Error(
      'Webhook deduplication database table is missing. Apply src/database/migrations/20261104_whatsapp_webhook_deduplication.sql before starting the bot.'
    );
  }

  const paymentSchema = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'manual_payment_requests' AND column_name = 'network'"
  );
  const transactionIndex = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'manual_payment_requests' AND indexname = 'idx_manual_payment_transaction_id_unique'"
  );
  if (!paymentSchema.rows[0] || !transactionIndex.rows[0]) {
    throw new Error(
      'Payment database schema is outdated. Apply src/database/migrations/20261104_manual_payment_constraints.sql, then restart the bot.'
    );
  }
}

async function startServer() {
  const status = validateEnvironment();
  logger.info({ environment: status.environment, messagingProvider: status.messagingProvider }, 'Environment validated');

  if (env.NODE_ENV === 'production') {
    await verifyPersistentStorage();
    logger.info('Persistent subscription and payment storage verified');
  }

  try {
    await ensureExpiryReminderSchedule();
  } catch (error) {
    logger.warn({ error }, 'Expiry reminder schedule not started (Redis may be down)');
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
