import IORedis from 'ioredis';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { env } from '../config/env.js';

const redisClient = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;
const rateLimiter = redisClient
  ? new RateLimiterRedis({
      storeClient: redisClient,
      keyPrefix: 'elisha-sports-bot-rate-limit',
      points: 30,
      duration: 60
    })
  : null;

export async function defaultRateLimiter(req, res, next) {
  if (!rateLimiter) {
    return next();
  }

  try {
    const key = req.ip ?? 'anonymous';
    await rateLimiter.consume(key);
    return next();
  } catch (error) {
    return res.status(429).json({
      ok: false,
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later.'
    });
  }
}

export default defaultRateLimiter;
