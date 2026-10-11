import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { getUserSubscriptions } from './subscriptionService.js';

export const QUOTA_TRACKED_COMMANDS = new Set([
  'fixtures', 'live', 'table', 'form', 'h2h', 'analyze', 'analysis', 'season', 'historical'
]);

const inMemoryUsage = new Map();

export function getCommandName(message) {
  return String(message ?? '').trim().split(/\s+/, 1)[0].toLowerCase();
}

export function isQuotaTrackedMessage(message) {
  return QUOTA_TRACKED_COMMANDS.has(getCommandName(message));
}

export function getDailyRequestLimit(plan = 'free') {
  return plan === 'premium'
    ? env.PREMIUM_DAILY_REQUEST_LIMIT
    : env.FREE_DAILY_REQUEST_LIMIT;
}

export function getKampalaDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getNextKampalaMidnight(now = new Date()) {
  const [year, month, day] = getKampalaDate(now).split('-').map(Number);
  // Uganda uses UTC+3 year-round, so Kampala midnight is 21:00 UTC on the prior date.
  return new Date(Date.UTC(year, month - 1, day + 1) - (3 * 60 * 60 * 1000));
}

function isPremiumSubscription(subscription) {
  return String(subscription?.plan ?? '').toLowerCase() === 'premium' && subscription?.is_active !== false;
}

async function getPlanForPhone(phone) {
  const subscriptions = await getUserSubscriptions(phone);
  return subscriptions.some(isPremiumSubscription) ? 'premium' : 'free';
}

export async function checkAndConsumeDailyRequest(phone, message) {
  if (!isQuotaTrackedMessage(message)) {
    return { allowed: true, tracked: false };
  }

  const plan = await getPlanForPhone(phone);
  const limit = getDailyRequestLimit(plan);

  if (!pool) {
    const date = getKampalaDate();
    const key = `${phone}:${date}`;
    const current = inMemoryUsage.get(key) ?? { requestsUsed: 0, outgoingMessages: 0 };
    if (current.requestsUsed >= limit) {
      return {
        allowed: false, tracked: true, plan, limit,
        used: current.requestsUsed,
        resetAt: getNextKampalaMidnight()
      };
    }
    current.requestsUsed += 1;
    inMemoryUsage.set(key, current);
    return { allowed: true, tracked: true, plan, limit, used: current.requestsUsed };
  }

  // Atomic UPSERT means concurrent requests cannot exceed the configured daily limit.
  const consumed = await pool.query(
    `INSERT INTO daily_usage (phone, usage_date, requests_used, outgoing_messages)
     VALUES ($1, (NOW() AT TIME ZONE 'Africa/Kampala')::date, 1, 0)
     ON CONFLICT (phone, usage_date)
     DO UPDATE SET
       requests_used = daily_usage.requests_used + 1,
       updated_at = NOW()
     WHERE daily_usage.requests_used < $2
     RETURNING requests_used, outgoing_messages`,
    [phone, limit]
  );

  if (consumed.rows[0]) {
    return { allowed: true, tracked: true, plan, limit, used: Number(consumed.rows[0].requests_used) };
  }

  const current = await pool.query(
    `SELECT requests_used, outgoing_messages
       FROM daily_usage
      WHERE phone = $1
        AND usage_date = (NOW() AT TIME ZONE 'Africa/Kampala')::date
      LIMIT 1`,
    [phone]
  );

  return {
    allowed: false,
    tracked: true,
    plan,
    limit,
    used: Number(current.rows[0]?.requests_used ?? limit),
    resetAt: getNextKampalaMidnight()
  };
}

export async function recordOutgoingMessage(phone) {
  if (!pool) {
    const key = `${phone}:${getKampalaDate()}`;
    const current = inMemoryUsage.get(key) ?? { requestsUsed: 0, outgoingMessages: 0 };
    current.outgoingMessages += 1;
    inMemoryUsage.set(key, current);
    return current.outgoingMessages;
  }

  const result = await pool.query(
    `INSERT INTO daily_usage (phone, usage_date, requests_used, outgoing_messages)
     VALUES ($1, (NOW() AT TIME ZONE 'Africa/Kampala')::date, 0, 1)
     ON CONFLICT (phone, usage_date)
     DO UPDATE SET
       outgoing_messages = daily_usage.outgoing_messages + 1,
       updated_at = NOW()
     RETURNING outgoing_messages`,
    [phone]
  );
  return Number(result.rows[0]?.outgoing_messages ?? 0);
}

export function formatQuotaLimitMessage({ plan = 'free', limit, used, resetAt = getNextKampalaMidnight() }) {
  const resetText = new Intl.DateTimeFormat('en-UG', {
    timeZone: 'Africa/Kampala',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(resetAt);

  if (plan === 'premium') {
    return `⏳ PREMIUM DAILY LIMIT REACHED\n\nYou've used ${used}/${limit} requests for today. Your quota resets at ${resetText} East Africa Time. Please wait until it resets.`;
  }

  return `⏳ FREE DAILY LIMIT REACHED\n\nYou've used ${used}/${limit} free requests for today. Your free quota resets at ${resetText} East Africa Time.\n\nWant a higher limit? Upgrade to Premium. Premium activation is not automatic yet; payment and subscription status must be verified by the bot administrator.`;
}
