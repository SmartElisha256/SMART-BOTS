import IORedis from 'ioredis';
import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { runAnalyzeCommand, runTipCommand } from '../commands/analyzeCommand.js';
import { recordOutgoingMessage } from '../services/usageService.js';

const connection = env.REDIS_URL
  ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
  : null;

let worker = null;

async function processJob(job) {
  logger.info({ jobName: job.name, jobId: job.id, data: job.data }, 'Processing job');

  if (job.name === 'send-notification') {
    const { phone, text } = job.data;
    const provider = createMessagingAdapter();
    await provider.sendMessage({ to: phone, text });
    try {
      await recordOutgoingMessage(phone);
    } catch (error) {
      logger.warn({ error, phone }, 'Could not record outgoing notification usage');
    }
    return { ok: true, type: 'notification' };
  }

  if (job.name === 'match-analysis') {
    const { phone, kind, args } = job.data;
    let text;
    try {
      if (kind === 'tip') {
        text = await runTipCommand();
      } else {
        text = await runAnalyzeCommand(args);
      }
    } catch (error) {
      logger.error({ error, phone, kind }, 'Analysis job failed');
      text = '⚠️ Match analysis could not be completed right now. Please try again in a few minutes. I will not invent probabilities or statistics.';
    }

    const provider = createMessagingAdapter();
    await provider.sendMessage({
      to: phone,
      text: text || 'Analysis completed, but no content was generated. Please try again.'
    });
    try {
      await recordOutgoingMessage(phone);
    } catch (error) {
      logger.warn({ error, phone }, 'Could not record outgoing analysis usage');
    }
    return { ok: true, type: 'analysis', kind };
  }

  logger.warn({ jobName: job.name }, 'Unknown job type');
  return { ok: true, processed: true };
}

if (connection) {
  worker = new Worker('elisha-sports-bot', processJob, {
    connection,
    concurrency: env.JOB_CONCURRENCY
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Job completed');
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
} else {
  logger.warn('REDIS_URL not set; BullMQ worker not started');
}

export default worker;
