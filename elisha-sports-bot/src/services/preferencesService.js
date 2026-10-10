import pool from '../database/pool.js';

const preferences = new Map();

export async function getUserPreferences(phone) {
  if (!pool) {
    if (!preferences.has(phone)) preferences.set(phone, { phone, notifications_enabled: true, preferred_team: null });
    return preferences.get(phone);
  }

  const result = await pool.query(
    `INSERT INTO user_preferences (phone) VALUES ($1)
     ON CONFLICT (phone) DO NOTHING`,
    [phone]
  );
  const found = await pool.query('SELECT * FROM user_preferences WHERE phone = $1 LIMIT 1', [phone]);
  return found.rows[0] ?? { phone, notifications_enabled: true, preferred_team: null };
}

export async function updateUserPreferences(phone, updates = {}) {
  const allowed = {};
  if (typeof updates.notifications_enabled === 'boolean') allowed.notifications_enabled = updates.notifications_enabled;
  if (typeof updates.preferred_team === 'string' || updates.preferred_team === null) allowed.preferred_team = updates.preferred_team;
  if (!pool) {
    const current = await getUserPreferences(phone);
    const next = { ...current, ...allowed, phone };
    preferences.set(phone, next);
    return next;
  }

  await getUserPreferences(phone);
  const fields = Object.keys(allowed);
  if (!fields.length) return getUserPreferences(phone);
  const values = [phone, ...fields.map((field) => allowed[field])];
  const assignments = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
  const result = await pool.query(
    `UPDATE user_preferences SET ${assignments}, updated_at = NOW() WHERE phone = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}
