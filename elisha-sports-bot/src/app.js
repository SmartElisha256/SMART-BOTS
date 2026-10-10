import express from 'express';
import { healthRouter } from '../routes/health.js';
import { webhookRouter } from '../routes/webhook.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { defaultRateLimiter } from '../middleware/rateLimiter.js';
import { requestIdMiddleware } from '../middleware/requestId.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use(requestIdMiddleware);
  app.use(defaultRateLimiter);

  app.use('/health', healthRouter);
  app.use('/webhook', webhookRouter);

  app.use((req, res) => {
    res.status(404).json({ ok: false, message: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}

export default createApp;
