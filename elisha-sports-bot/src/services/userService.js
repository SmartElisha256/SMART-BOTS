import { z } from 'zod';
import pool from '../database/pool.js';

const userSchema = z.object({
  phone: z.string().min(5),
  provider: z.enum(['whatsapp', 'callmebot', 'mock']).default('whatsapp')
});

const inMemoryUsers = new Map();

export async function upsertUser({ phone, provider }) {
  const payload = userSchema.parse({ phone, provider });

  if (!pool) {
    const existing = inMemoryUsers.get(payload.phone);

    if (existing) {
      existing.provider = payload.provider;
      return existing;
    }

    const user = { id: `local-${inMemoryUsers.size + 1}`, phone: payload.phone, provider: payload.provider, created_at: new Date().toISOString() };
    inMemoryUsers.set(payload.phone, user);
    return user;
  }

  const query = `
    INSERT INTO users (phone, provider)
    VALUES ($1, $2)
    ON CONFLICT (phone)
    DO UPDATE SET provider = EXCLUDED.provider, updated_at = NOW()
    RETURNING *
  `;

  const result = await pool.query(query, [payload.phone, payload.provider]);
  return result.rows[0];
}

export async function findUserByPhone(phone) {
  if (!pool) {
    return inMemoryUsers.get(phone) ?? null;
  }

  const result = await pool.query('SELECT * FROM users WHERE phone = $1 LIMIT 1', [phone]);
  return result.rows[0] ?? null;
}
