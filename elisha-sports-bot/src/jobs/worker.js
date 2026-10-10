import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const connection = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;

if (connection) {
  const worker = new Worker(
    'elisha-sports-bot',
    async (job) => {
      logger.info({ jobName: job.name, data: job.data }, 'Processing queue job');
      return { ok: true, processed: true };
    },
    { connection }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  process.on('SIGTERM', async () => {
    await worker.close();
  });
}

export default connection;
