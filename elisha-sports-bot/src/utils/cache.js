import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

const redis = env.NODE_ENV === 'test' ? null : env.REDIS_URL ? new IORedis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => times > 3 ? null : Math.min(times * 200, 1000)
}) : null;

const DEFAULT_TTL = 600;
/** Keep a longer stale copy so rate-limits / outages can still serve last good data. */
const STALE_MULTIPLIER = 6;

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

/** Last successful payload even after primary TTL expired (soft failure path). */
export async function getStaleCached(key) {
  if (!redis) return null;
  try {
    const data = await redis.get(`${key}:stale`);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Stale cache read error');
    return null;
  }
}

export async function setCached(key, value, ttlSeconds = DEFAULT_TTL) {
  if (!redis) return false;
  try {
    const ttl = Math.max(1, Number(ttlSeconds) || DEFAULT_TTL);
    const payload = JSON.stringify(value);
    await redis.setex(key, ttl, payload);
    await redis.setex(`${key}:stale`, ttl * STALE_MULTIPLIER, payload);
    return true;
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Cache write error');
    return false;
  }
}

export async function deleteCached(key) {
  if (!redis) return false;
  try {
    await redis.del(key, `${key}:stale`);
    return true;
  } catch (error) {
    logger.warn({ key, error: error.message }, 'Cache delete error');
    return false;
  }
}

export function generateCacheKey(prefix, ...parts) {
  return `cache:${prefix}:${parts.join(':')}`;
}
