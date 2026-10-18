import { env } from '../config/env.js';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Protects /admin routes. Requires ADMIN_API_KEY in the environment.
 * Accepts header: x-admin-key: <key>  OR  Authorization: Bearer <key>
 */
export function requireAdmin(req, res, next) {
  const configured = String(env.ADMIN_API_KEY || '').trim();
  if (!configured || configured === 'replace-me') {
    return res.status(503).json({
      ok: false,
      message: 'Admin dashboard is not configured. Set ADMIN_API_KEY in the environment.'
    });
  }

  const headerKey = req.get('x-admin-key');
  const auth = req.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const queryKey = typeof req.query.key === 'string' ? req.query.key : '';
  const provided = headerKey || bearer || queryKey;

  if (!provided || !safeEqual(provided, configured)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  next();
}
