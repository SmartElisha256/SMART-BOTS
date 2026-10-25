import pool from '../database/pool.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';

const memoryFeedback = [];
const MIN_LEN = 8;
const MAX_LEN = 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const recentByPhone = new Map();

const CATEGORY_KEYWORDS = [
  { cat: 'bug', re: /\b(bug|broken|error|crash|not work|doesn't work|does not work|fail|wrong|glitch)\b/i },
  { cat: 'feature', re: /\b(add|feature|please add|suggestion|improve|wish|should have|can you add|request)\b/i },
  { cat: 'payment', re: /\b(pay|payment|premium|upgrade|money|airtel|momo|transaction)\b/i },
  { cat: 'tip', re: /\b(tip|predict|accuracy|wrong tip|bad tip|analyze)\b/i },
  { cat: 'praise', re: /\b(love|great|awesome|thank|thanks|good job|excellent|nice)\b/i }
];

function detectCategory(text) {
  for (const row of CATEGORY_KEYWORDS) {
    if (row.re.test(text)) return row.cat;
  }
  return 'general';
}

function rateLimited(phone) {
  const now = Date.now();
  const key = String(phone || '');
  const list = (recentByPhone.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    recentByPhone.set(key, list);
    return true;
  }
  list.push(now);
  recentByPhone.set(key, list);
  return false;
}

export async function submitFeedback({ phone, text }) {
  const body = String(text ?? '').trim();
  if (!body || body.length < MIN_LEN) {
    return (
      '📝 FEEDBACK\n\n' +
      'Tell us what to fix or improve (at least a short sentence).\n\n' +
      'Examples:\n' +
      '• FEEDBACK Form command is slow for UPL teams\n' +
      '• REVIEW Please add AFCON fixtures\n' +
      '• FEEDBACK Payment confirmed but Premium not activated\n\n' +
      'Your message goes to the developers (SMART ELISHA 256).'
    );
  }
  if (body.length > MAX_LEN) {
    return `Please keep feedback under ${MAX_LEN} characters.`;
  }
  if (rateLimited(phone)) {
    return 'You have sent several reviews recently. Please wait a few minutes before sending another. Thank you.';
  }

  const category = detectCategory(body);
  let id = null;

  if (!pool) {
    id = memoryFeedback.length + 1;
    memoryFeedback.push({
      id, phone, category, message: body, status: 'new', created_at: new Date().toISOString()
    });
  } else {
    try {
      const result = await pool.query(
        `INSERT INTO user_feedback (phone, category, message, status)
         VALUES ($1, $2, $3, 'new') RETURNING id`,
        [phone, category, body]
      );
      id = result.rows[0]?.id ?? null;
    } catch (error) {
      logger.error({ error }, 'Could not store user feedback (table may be missing)');
      return 'Sorry — feedback could not be saved right now. Please try again later or message the admin directly.';
    }
  }

  notifyAdmins({ id, phone, category, message: body }).catch((error) => {
    logger.warn({ error }, 'Could not notify admins of new feedback');
  });

  return (
    `✅ Feedback received (#${id ?? '—'})\n\n` +
    `Category: ${category}\n` +
    'Thank you — the team at SMART ELISHA 256 will use this to fix and improve the bot.\n\n' +
    'You can send another review anytime with FEEDBACK or REVIEW.'
  );
}

async function notifyAdmins({ id, phone, category, message }) {
  const phones = String(env.PAYMENT_ADMIN_PHONES || '')
    .split(',')
    .map((p) => p.trim().replace(/[^0-9]/g, ''))
    .filter(Boolean);
  if (!phones.length) return;

  const snippet = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  const text =
    `📝 NEW FEEDBACK #${id}\nFrom: ${phone}\nCategory: ${category}\nMessage:\n${snippet}\n\nAdmin API: GET /admin/api/feedback`;

  try {
    const provider = createMessagingAdapter();
    for (const to of phones) {
      await provider.sendMessage({ to, text });
    }
  } catch (error) {
    logger.warn({ error }, 'Feedback admin WhatsApp notify failed');
  }
}

export async function listFeedback({ status = null, limit = 30 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
  if (!pool) {
    let rows = [...memoryFeedback].reverse();
    if (status) rows = rows.filter((r) => r.status === status);
    return rows.slice(0, lim);
  }
  try {
    if (status) {
      const result = await pool.query(
        `SELECT id, phone, category, message, status, admin_notes, created_at, reviewed_at
         FROM user_feedback WHERE status = $1 ORDER BY created_at DESC LIMIT $2`,
        [status, lim]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT id, phone, category, message, status, admin_notes, created_at, reviewed_at
       FROM user_feedback ORDER BY created_at DESC LIMIT $1`,
      [lim]
    );
    return result.rows;
  } catch (error) {
    logger.warn({ error }, 'Could not list feedback');
    return [];
  }
}

export async function markFeedbackReviewed(id, { notes = null } = {}) {
  if (!pool) {
    const row = memoryFeedback.find((r) => r.id === Number(id));
    if (!row) return { ok: false, message: 'Feedback not found' };
    row.status = 'reviewed';
    row.reviewed_at = new Date().toISOString();
    if (notes) row.admin_notes = notes;
    return { ok: true, message: `Feedback #${id} marked reviewed` };
  }
  try {
    const result = await pool.query(
      `UPDATE user_feedback
       SET status = 'reviewed', reviewed_at = NOW(),
           admin_notes = COALESCE($2, admin_notes)
       WHERE id = $1 RETURNING id`,
      [Number(id), notes]
    );
    if (!result.rows.length) return { ok: false, message: 'Feedback not found' };
    return { ok: true, message: `Feedback #${id} marked reviewed` };
  } catch (error) {
    logger.warn({ error }, 'Could not update feedback');
    return { ok: false, message: 'Could not update feedback' };
  }
}
