import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const redis = env.REDIS_URL ? new IORedis(env.REDIS_URL) : null;

const DEFAULT_TTL = 600;

export async function getCached(key) {
  if (!redis) return null;

  try {
    const data = await redis.get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Cache read error');
    return null;
  }
}

export async function setCached(key, value, ttlSeconds = DEFAULT_TTL) {
  if (!redis) return false;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Cache write error');
    return false;
  }
}

export async function deleteCached(key) {
  if (!redis) return false;

  try {
    await redis.del(key);
    return true;
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Cache delete error');
    return false;
  }
}

export function generateCacheKey(prefix, ...parts) {
  return `cache:${prefix}:${parts.join(':')}`;
}
