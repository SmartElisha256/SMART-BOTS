import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { getUserSubscriptions } from './subscriptionService.js';

export const QUOTA_TRACKED_COMMANDS = new Set([
  'fixtures', 'live', 'table', 'form', 'h2h', 'analyze', 'analysis', 'season', 'historical'
]);

const inMemoryUsage = new Map();
const inMemoryMonthlyUsage = new Map();

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

export function getMonthlyRequestLimit(plan = 'free') {
  return plan === 'premium' ? env.PREMIUM_MONTHLY_REQUEST_LIMIT : null;
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

export function getKampalaMonth(now = new Date()) {
  return getKampalaDate(now).slice(0, 7);
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

function monthlyLimitResult({ used, limit }) {
  return {
    allowed: false,
    tracked: true,
    plan: 'premium',
    period: 'month',
    limit,
    monthlyLimit: limit,
    used,
    monthlyUsed: used
  };
}

export async function checkAndConsumeDailyRequest(phone, message) {
  if (!isQuotaTrackedMessage(message)) {
    return { allowed: true, tracked: false };
  }

  const plan = await getPlanForPhone(phone);
  const limit = getDailyRequestLimit(plan);
  const monthlyLimit = getMonthlyRequestLimit(plan);

  if (!pool) {
    const date = getKampalaDate();
    const month = getKampalaMonth();
    const dailyKey = `${phone}:${date}`;
    const monthlyKey = `${phone}:${month}`;
    const current = inMemoryUsage.get(dailyKey) ?? { requestsUsed: 0, outgoingMessages: 0 };
    const monthlyUsed = inMemoryMonthlyUsage.get(monthlyKey) ?? 0;

    if (monthlyLimit !== null && monthlyUsed >= monthlyLimit) {
      return monthlyLimitResult({ used: monthlyUsed, limit: monthlyLimit });
    }

    if (current.requestsUsed >= limit) {
      return {
        allowed: false, tracked: true, plan, limit,
        used: current.requestsUsed,
        monthlyLimit,
        monthlyUsed,
        resetAt: getNextKampalaMidnight()
      };
    }

    current.requestsUsed += 1;
    inMemoryUsage.set(dailyKey, current);
    if (monthlyLimit !== null) inMemoryMonthlyUsage.set(monthlyKey, monthlyUsed + 1);

    return {
      allowed: true,
      tracked: true,
      plan,
      limit,
      used: current.requestsUsed,
      monthlyLimit,
      monthlyUsed: monthlyLimit === null ? null : monthlyUsed + 1
    };
  }

  // Serialize quota checks per phone so concurrent requests cannot exceed the monthly cap.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [phone]);

    let monthlyUsed = 0;
    if (monthlyLimit !== null) {
      const monthResult = await client.query(
        `SELECT COALESCE(SUM(requests_used), 0)::int AS monthly_used
           FROM daily_usage
          WHERE phone = $1
            AND usage_date >= date_trunc('month', NOW() AT TIME ZONE 'Africa/Kampala')::date
            AND usage_date < (date_trunc('month', NOW() AT TIME ZONE 'Africa/Kampala') + INTERVAL '1 month')::date`,
        [phone]
      );
      monthlyUsed = Number(monthResult.rows[0]?.monthly_used ?? 0);
      if (monthlyUsed >= monthlyLimit) {
        await client.query('ROLLBACK');
        return monthlyLimitResult({ used: monthlyUsed, limit: monthlyLimit });
      }
    }

    // Atomic UPSERT means concurrent requests cannot exceed the configured daily limit.
    const consumed = await client.query(
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
      await client.query('COMMIT');
      return {
        allowed: true,
        tracked: true,
        plan,
        limit,
        used: Number(consumed.rows[0].requests_used),
        monthlyLimit,
        monthlyUsed: monthlyLimit === null ? null : monthlyUsed + 1
      };
    }

    const current = await client.query(
      `SELECT requests_used, outgoing_messages
         FROM daily_usage
        WHERE phone = $1
          AND usage_date = (NOW() AT TIME ZONE 'Africa/Kampala')::date
        LIMIT 1`,
      [phone]
    );
    await client.query('COMMIT');

    return {
      allowed: false,
      tracked: true,
      plan,
      limit,
      used: Number(current.rows[0]?.requests_used ?? limit),
      monthlyLimit,
      monthlyUsed,
      resetAt: getNextKampalaMidnight()
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
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

export function formatQuotaLimitMessage({
  plan = 'free',
  limit,
  used,
  monthlyLimit = null,
  monthlyUsed = null,
  period = 'day',
  resetAt = getNextKampalaMidnight()
}) {
  if (period === 'month') {
    return `⏳ PREMIUM MONTHLY LIMIT REACHED\n\nYou've used ${monthlyUsed ?? used}/${monthlyLimit ?? limit} requests for this month. Your monthly quota resets on the 1st of next month (East Africa Time). You can still use MENU and HELP.`;
  }

  const resetText = new Intl.DateTimeFormat('en-UG', {
    timeZone: 'Africa/Kampala',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(resetAt);

  if (plan === 'premium') {
    const monthlyText = monthlyLimit === null ? '' : `\nMonthly usage: ${monthlyUsed ?? 0}/${monthlyLimit} requests.`;
    return `⏳ PREMIUM DAILY LIMIT REACHED\n\nYou've used ${used}/${limit} requests for today. Your daily quota resets at ${resetText} East Africa Time.${monthlyText}`;
  }

  return `⏳ FREE DAILY LIMIT REACHED\n\nYou've used ${used}/${limit} free requests for today. Your free quota resets at ${resetText} East Africa Time.\n\nWant a higher limit? Upgrade to Premium. Premium activation is not automatic yet; payment and subscription status must be verified by the bot administrator.`;
}
