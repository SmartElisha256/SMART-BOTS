import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const connection = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;

let worker = null;

if (connection) {
  worker = new Worker(
    'elisha-sports-bot',
    async (job) => {
      logger.info({ jobName: job.name, jobId: job.id, data: job.data }, 'Processing job');
      return { ok: true, processed: true };
    },
    {
      connection,
      concurrency: env.JOB_CONCURRENCY
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message, attempt: job?.attemptsMade }, 'Job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error: error.message }, 'Worker error');
  });

  process.on('SIGTERM', async () => {
    logger.warn('SIGTERM received, closing worker');
    await worker.close();
    process.exit(0);
  });

  logger.info({ concurrency: env.JOB_CONCURRENCY }, 'BullMQ worker started');
}

export default worker;
