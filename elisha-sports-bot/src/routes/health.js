import { Router } from 'express';
import { testDatabaseConnection } from '../database/pool.js';
import { env } from '../config/env.js';
import IORedis from 'ioredis';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  const dbConnection = await testDatabaseConnection();
  const redisConnected = Boolean(env.REDIS_URL);

  res.status(dbConnection.ok ? 200 : 503).json({
    ok: dbConnection.ok,
    service: 'ELISHA SPORTS BOT',
    status: dbConnection.ok ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbConnection.ok ? 'connected' : 'disconnected',
    redis: redisConnected ? 'configured' : 'not configured',
    uptime: process.uptime()
  });
});

healthRouter.get('/ready', async (req, res) => {
  const dbConnection = await testDatabaseConnection();
  let redisHealth = { ok: true };

  if (env.REDIS_URL) {
    const redis = new IORedis(env.REDIS_URL, { connectTimeout: 2000, retryStrategy: () => null });
    try {
      await redis.ping();
    } catch (error) {
      redisHealth = { ok: false, error: error.message };
    } finally {
      redis.disconnect();
    }
  }

  const ready = dbConnection.ok && redisHealth.ok;

  res.status(ready ? 200 : 503).json({
    ok: ready,
    message: ready ? 'Ready for traffic' : 'Not ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbConnection.ok ? 'ok' : `failed: ${dbConnection.message}`,
      redis: redisHealth.ok ? 'ok' : `failed: ${redisHealth.error}`
    }
  });
});
