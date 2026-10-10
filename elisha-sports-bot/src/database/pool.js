import pkg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pkg;

const pool = env.DATABASE_URL ? new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
}) : null;

export async function testDatabaseConnection() {
  if (!pool) {
    return { ok: false, message: 'DATABASE_URL not configured' };
  }

  try {
    const result = await pool.query('SELECT 1 AS ok');
    return { ok: true, result: result.rows[0] };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

export default pool;
