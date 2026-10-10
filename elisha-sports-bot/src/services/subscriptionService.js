import { z } from 'zod';
import pool from '../database/pool.js';

const subscriptionSchema = z.object({
  phone: z.string().min(5),
  plan: z.string().default('premium')
});

const inMemorySubscriptions = new Map();

export async function getUserSubscriptions(phone) {
  if (!pool) {
    return inMemorySubscriptions.get(phone) ?? [];
  }

  const result = await pool.query('SELECT * FROM subscriptions WHERE phone = $1 AND is_active = TRUE', [phone]);
  return result.rows;
}

export async function subscribeUser({ phone, plan }) {
  const payload = subscriptionSchema.parse({ phone, plan });

  if (!pool) {
    const current = inMemorySubscriptions.get(payload.phone) ?? [];
    const item = { phone: payload.phone, plan: payload.plan, is_active: true, created_at: new Date().toISOString() };
    const updated = [...current.filter((entry) => entry.plan !== payload.plan), item];
    inMemorySubscriptions.set(payload.phone, updated);
    return item;
  }

  const result = await pool.query(
    `
      INSERT INTO subscriptions (phone, plan, is_active)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (phone, plan)
      DO UPDATE SET is_active = TRUE, updated_at = NOW()
      RETURNING *
    `,
    [payload.phone, payload.plan]
  );

  return result.rows[0];
}

export async function unsubscribeUser(phone) {
  if (!pool) {
    const subscriptions = inMemorySubscriptions.get(phone) ?? [];
    if (!subscriptions.length) return false;
    const next = subscriptions.map((entry) => ({ ...entry, is_active: false }));
    inMemorySubscriptions.set(phone, next);
    return true;
  }

  const result = await pool.query(
    'UPDATE subscriptions SET is_active = FALSE, updated_at = NOW() WHERE phone = $1 AND is_active = TRUE RETURNING *',
    [phone]
  );

  return result.rowCount > 0;
}
