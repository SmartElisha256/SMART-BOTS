import express from 'express';
import { healthRouter } from './routes/health.js';
import { webhookRouter } from './routes/webhook.js';
import { footballMlRouter } from './routes/footballMl.js';
import { adminRouter } from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';
import { defaultRateLimiter } from './middleware/rateLimiter.js';
import { requestIdMiddleware } from './middleware/requestId.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // Preserve the exact request bytes for Meta's X-Hub-Signature-256 verification.
  app.use(express.json({
    limit: '1mb',
    verify: (req, res, buffer) => {
      req.rawBody = Buffer.from(buffer);
    }
  }));

  app.use(requestIdMiddleware);
  app.use(defaultRateLimiter);

  app.get('/', (req, res) => {
    res.json({ ok: true, service: 'ELISHA SPORTS BOT' });
  });
  app.use('/health', healthRouter);
  app.use('/webhook', webhookRouter);
  app.use('/api/football-ml', footballMlRouter);
  app.use('/admin', adminRouter);

  app.use((req, res) => {
    res.status(404).json({ ok: false, message: 'Route not found', requestId: req.id });
  });

  app.use(errorHandler);
  return app;
}

export default createApp;
