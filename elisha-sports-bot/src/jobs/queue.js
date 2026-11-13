import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

// Avoid open Redis handles in unit tests (CI hangs without a Redis server).
const connection =
  env.NODE_ENV === 'test' || !env.REDIS_URL
    ? null
    : new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        lazyConnect: true,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))
      });
if (connection) {
  connection.connect().catch(() => {
    /* connection errors surface when jobs are enqueued */
  });
}

export const sportsQueue = connection
  ? new Queue('elisha-sports-bot', { connection })
  : null;

logger.info(
  { configured: Boolean(sportsQueue), maxAttempts: env.JOB_MAX_ATTEMPTS, concurrency: env.JOB_CONCURRENCY },
  'BullMQ queue initialized'
);

export function isQueueAvailable() {
  return Boolean(sportsQueue);
}

export async function addNotificationJob({ phone, text }) {
  if (!sportsQueue) {
    return { ok: true, queued: false, reason: 'Redis not configured; worker disabled' };
  }

  try {
    const job = await sportsQueue.add(
      'send-notification',
      { phone, text },
      {
        attempts: env.JOB_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    logger.info({ jobId: job.id, phone }, 'Notification job enqueued');
    return { ok: true, queued: true, jobId: job.id };
  } catch (error) {
    logger.error({ phone, error: error.message }, 'Failed to enqueue notification job');
    throw error;
  }
}

export async function addAnalysisJob({ phone, kind, args, provider = 'whatsapp' }) {
  if (!sportsQueue) {
    return { ok: false, queued: false, reason: 'Redis not configured' };
  }

  try {
    const job = await sportsQueue.add(
      'match-analysis',
      { phone, kind, args: args ?? null, provider },
      {
        attempts: Math.min(env.JOB_MAX_ATTEMPTS, 2),
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 50,
        jobId: `analysis:${phone}:${kind}:${String(args ?? '').toLowerCase().slice(0, 80)}`
      }
    );

    logger.info({ jobId: job.id, phone, kind }, 'Analysis job enqueued');
    return { ok: true, queued: true, jobId: job.id };
  } catch (error) {
    if (String(error.message || '').includes('Job') && String(error.message || '').includes('exists')) {
      return { ok: true, queued: true, deduped: true };
    }
    logger.error({ phone, kind, error: error.message }, 'Failed to enqueue analysis job');
    throw error;
  }
}

/** Schedule repeating Premium expiry reminders (every hour). Call once at startup. */
export async function ensureExpiryReminderSchedule() {
  if (!sportsQueue) return { ok: false, reason: 'Redis not configured' };
  try {
    await sportsQueue.add(
      'premium-expiry-reminders',
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'repeat:premium-expiry-reminders',
        removeOnComplete: true,
        removeOnFail: 20
      }
    );
    logger.info('Premium expiry reminder schedule ensured (hourly)');
    return { ok: true };
  } catch (error) {
    logger.warn({ error: error.message }, 'Could not ensure expiry reminder schedule');
    return { ok: false, error: error.message };
  }
}

export async function getQueueStats() {
  if (!sportsQueue) return { configured: false };

  try {
    const counts = await sportsQueue.getJobCounts('wait', 'active', 'completed', 'failed');
    return { configured: true, jobs: counts };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get queue stats');
    return { configured: true, error: error.message };
  }
}
