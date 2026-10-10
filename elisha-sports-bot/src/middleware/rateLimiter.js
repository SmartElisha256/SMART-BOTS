import IORedis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const redisClient = env.REDIS_URL ? new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => times > 3 ? null : Math.min(times * 200, 1000)
}) : null;

const rateLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'elisha-sports-bot-rate-limit',
      points: env.RATE_LIMIT_POINTS,
      duration: env.RATE_LIMIT_DURATION
    })
  : null;

export async function defaultRateLimiter(req, res, next) {
  if (!rateLimiter) return next();

  try {
    await rateLimiter.consume(req.ip ?? 'anonymous');
    return next();
  } catch (error) {
    // A limiter rejection carries msBeforeNext. Redis outages should not
    // masquerade as rate-limit violations; log them and fail open.
    if (Number.isFinite(error?.msBeforeNext)) {
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests, please try again later.'
      });
    }
    logger.error({ error: error?.message }, 'Rate limiter unavailable; allowing request');
    return next();
  }
}

export default defaultRateLimiter;
