import { z } from 'zod';
import pool from '../database/pool.js';

const subscriptionSchema = z.object({
  phone: z.string().min(5),
  plan: z.string().default('premium'),
  durationDays: z.number().int().positive().optional()
});
const inMemorySubscriptions = new Map();

export function isSubscriptionActive(subscription, now = Date.now()) {
  return Boolean(subscription && subscription.is_active !== false &&
    (!subscription.expires_at || new Date(subscription.expires_at).getTime() > now));
}

export async function getUserSubscriptions(phone) {
  if (!pool) {
    const now = Date.now();
    return (inMemorySubscriptions.get(phone) ?? []).filter((entry) => isSubscriptionActive(entry, now));
  }
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE phone = $1 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())',
    [phone]
  );
  return result.rows;
}

export async function subscribeUser({ phone, plan, durationDays }) {
  const payload = subscriptionSchema.parse({ phone, plan, durationDays });
  if (!pool) {
    const current = inMemorySubscriptions.get(payload.phone) ?? [];
    const existing = current.find((entry) => entry.plan === payload.plan);
    const now = Date.now();
    const existingExpiry = existing?.expires_at ? new Date(existing.expires_at).getTime() : now;
    const expiresAt = payload.durationDays
      ? new Date(Math.max(existingExpiry, now) + payload.durationDays * 86400000).toISOString()
      : (existing?.expires_at ?? null);
    const item = { phone: payload.phone, plan: payload.plan, is_active: true, expires_at: expiresAt, created_at: existing?.created_at ?? new Date().toISOString() };
    inMemorySubscriptions.set(payload.phone, [...current.filter((entry) => entry.plan !== payload.plan), item]);
    return item;
  }
  if (payload.durationDays) {
    const result = await pool.query(
      'INSERT INTO subscriptions (phone, plan, is_active, expires_at) VALUES ($1, $2, TRUE, NOW() + ($3 * INTERVAL \'1 day\')) ON CONFLICT (phone, plan) DO UPDATE SET is_active = TRUE, expires_at = GREATEST(COALESCE(subscriptions.expires_at, NOW()), NOW()) + ($3 * INTERVAL \'1 day\'), updated_at = NOW() RETURNING *',
      [payload.phone, payload.plan, payload.durationDays]
    );
    return result.rows[0];
  }
  const result = await pool.query(
    'INSERT INTO subscriptions (phone, plan, is_active) VALUES ($1, $2, TRUE) ON CONFLICT (phone, plan) DO UPDATE SET is_active = TRUE, updated_at = NOW() RETURNING *',
    [payload.phone, payload.plan]
  );
  return result.rows[0];
}
export async function unsubscribeUser(phone) {
  if (!pool) {
    const subscriptions = inMemorySubscriptions.get(phone) ?? [];
    if (!subscriptions.length) return false;
    inMemorySubscriptions.set(phone, subscriptions.map((entry) => ({ ...entry, is_active: false })));
    return true;
  }
  const result = await pool.query('UPDATE subscriptions SET is_active = FALSE, updated_at = NOW() WHERE phone = $1 AND is_active = TRUE RETURNING *', [phone]);
  return result.rowCount > 0;
}
