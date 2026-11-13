import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { testDatabaseConnection } from '../database/pool.js';
import { getQueueStats, sportsQueue } from '../jobs/queue.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';

export async function checkDatabaseHealth() {
  const result = await testDatabaseConnection();
  return {
    name: 'database',
    ok: Boolean(result.ok),
    status: result.ok ? 'ok' : 'failed',
    detail: result.message || 'database query succeeded',
    extra: result.result ? { ok: result.result.ok } : undefined
  };
}

export async function checkRedisHealth() {
  if (!env.REDIS_URL) {
    return {
      name: 'redis',
      ok: false,
      status: 'disabled',
      detail: 'REDIS_URL is not configured'
    };
  }

  const client = new IORedis(env.REDIS_URL, {
    connectTimeout: 2000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null
  });

  try {
    await client.connect();
    await client.ping();
    return {
      name: 'redis',
      ok: true,
      status: 'ok',
      detail: 'redis ping succeeded'
    };
  } catch (error) {
    return {
      name: 'redis',
      ok: false,
      status: 'failed',
      detail: error?.message || 'redis ping failed'
    };
  } finally {
    client.disconnect();
  }
}

export async function checkQueueHealth() {
  if (!sportsQueue) {
    return {
      name: 'queue',
      ok: false,
      status: 'disabled',
      detail: 'BullMQ not configured (Redis not available)'
    };
  }

  try {
    const stats = await getQueueStats();
    return {
      name: 'queue',
      ok: !stats?.error,
      status: stats?.error ? 'failed' : 'ok',
      detail: stats?.error || 'queue stats available',
      extra: stats?.jobs ? { jobs: stats.jobs } : undefined
    };
  } catch (error) {
    return {
      name: 'queue',
      ok: false,
      status: 'failed',
      detail: error?.message || 'queue check failed'
    };
  }
}

export async function checkPythonRuntimeHealth() {
  return await new Promise((resolve) => {
    const child = spawn(pythonBin, ['-c', 'import sys; print(sys.version_info[:3]); import os; print(os.path.exists("predict.py"))'], {
      cwd: analyticsDir,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('close', (code) => {
      const ok = code === 0 && stdout.includes('True');
      resolve({
        name: 'python',
        ok,
        status: ok ? 'ok' : 'failed',
        detail: ok ? 'python runtime and analytics entrypoint available' : (stderr || 'python runtime unavailable'),
        extra: stdout ? { output: stdout.trim() } : undefined
      });
    });

    child.on('error', () => {
      resolve({
        name: 'python',
        ok: false,
        status: 'failed',
        detail: 'python runtime is unavailable or could not be started'
      });
    });
  });
}

export async function getSystemHealth() {
  const [database, redis, queue, python] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
    checkQueueHealth(),
    checkPythonRuntimeHealth()
  ]);

  const checks = { database, redis, queue, python };
  const critical = [database, redis, queue, python];
  const ready = critical.every((check) => check.ok || check.status === 'disabled');

  return {
    ok: ready,
    status: ready ? 'healthy' : 'degraded',
    service: 'ELISHA SPORTS BOT',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: env.NODE_ENV,
    checks
  };
}
