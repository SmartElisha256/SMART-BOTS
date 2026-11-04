import pool from '../database/pool.js';
import { env } from '../config/env.js';

const testClaims = new Map();
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Atomically claims a WhatsApp message ID. PostgreSQL is authoritative in
 * production, so restarts and multiple web instances share the same state.
 * Failed messages and abandoned processing leases may be retried.
 */
export async function claimMessage(identifier) {
  if (!identifier) return { claimed: true, durable: false };
  const id = String(identifier);

  if (!pool) {
    if (env.NODE_ENV !== 'test') {
      throw new Error('Durable webhook deduplication requires DATABASE_URL and the whatsapp_webhook_messages table.');
    }
    const previous = testClaims.get(id);
    if (previous && previous.status !== 'failed' && Date.now() - previous.updatedAt < LOCK_TIMEOUT_MS) {
      return { claimed: false, status: previous.status };
    }
    testClaims.set(id, { status: 'processing', attempts: (previous?.attempts || 0) + 1, updatedAt: Date.now() });
    return { claimed: true, durable: false };
  }

  const result = await pool.query(
    `INSERT INTO whatsapp_webhook_messages (message_id, status, attempts, locked_at, updated_at)
     VALUES ($1, 'processing', 1, NOW(), NOW())
     ON CONFLICT (message_id) DO UPDATE
       SET status = 'processing',
           attempts = whatsapp_webhook_messages.attempts + 1,
           locked_at = NOW(),
           updated_at = NOW(),
           last_error = NULL
       WHERE whatsapp_webhook_messages.status = 'failed'
          OR (whatsapp_webhook_messages.status = 'processing'
              AND whatsapp_webhook_messages.locked_at < NOW() - ($2::bigint * INTERVAL '1 millisecond'))
     RETURNING message_id`,
    [id, LOCK_TIMEOUT_MS]
  );
  return { claimed: result.rowCount === 1, durable: true };
}

export async function markMessageProcessed(identifier) {
  if (!identifier) return;
  const id = String(identifier);
  if (!pool) {
    const current = testClaims.get(id);
    if (current) testClaims.set(id, { ...current, status: 'processed', updatedAt: Date.now() });
    return;
  }
  await pool.query(
    `UPDATE whatsapp_webhook_messages
       SET status = 'processed', processed_at = NOW(), locked_at = NULL,
           updated_at = NOW(), last_error = NULL
     WHERE message_id = $1 AND status = 'processing'`,
    [id]
  );
}

export async function markMessageFailed(identifier, error) {
  if (!identifier) return;
  const id = String(identifier);
  const message = String(error?.message || error || 'Unknown processing error').slice(0, 1000);
  if (!pool) {
    const current = testClaims.get(id);
    if (current) testClaims.set(id, { ...current, status: 'failed', updatedAt: Date.now(), lastError: message });
    return;
  }
  await pool.query(
    `UPDATE whatsapp_webhook_messages
       SET status = 'failed', locked_at = NULL, updated_at = NOW(), last_error = $2
     WHERE message_id = $1 AND status = 'processing'`,
    [id, message]
  );
}

export function clearDeduplicationCache() {
  testClaims.clear();
}
