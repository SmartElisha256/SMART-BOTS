import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { env } from '../config/env.js';

const connection = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;

export const sportsQueue = connection ? new Queue('elisha-sports-bot', { connection }) : null;

export async function addNotificationJob({ phone, text }) {
  if (!sportsQueue) {
    return { ok: true, queued: false, reason: 'Redis not configured; worker disabled' };
  }

  const job = await sportsQueue.add('send-notification', { phone, text }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
  return { ok: true, queued: true, jobId: job.id };
}
