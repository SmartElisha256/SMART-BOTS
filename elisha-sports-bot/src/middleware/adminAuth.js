import { env } from '../config/env.js';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''));
  const right = Buffer.from(String(b ?? ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The dashboard HTML is a static shell; all data/actions remain protected.
 * Never accept credentials in URLs because URLs are commonly logged.
 */
export function requireAdmin(req, res, next) {
  if (req.method === 'GET' && req.path === '/') return next();

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
  const provided = headerKey || bearer;

  if (!provided || !safeEqual(provided, configured)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  next();
}
