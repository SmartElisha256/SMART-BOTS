import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const connection = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;

export const sportsQueue = connection ? new Queue('elisha-sports-bot', { connection }) : null;

logger.info(
  { configured: Boolean(sportsQueue), maxAttempts: env.JOB_MAX_ATTEMPTS, concurrency: env.JOB_CONCURRENCY },
  'BullMQ queue initialized'
);

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
        backoff: {
          type: 'exponential',
          delay: 1000
        },
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

export async function getQueueStats() {
  if (!sportsQueue) return { configured: false };

  try {
    const counts = await sportsQueue.getJobCounts('wait', 'active', 'completed', 'failed');
    return {
      configured: true,
      jobs: counts
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get queue stats');
    return { configured: true, error: error.message };
  }
}
