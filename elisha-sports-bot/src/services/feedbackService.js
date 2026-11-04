import pool from '../database/pool.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';

const MIN_LEN = 8;
const MAX_LEN = 1000;
const RATE_WINDOW_SECONDS = 600;
const RATE_MAX = 5;
const categories = [
  { cat: 'payment', re: /\b(pay|payment|premium|upgrade|money|airtel|momo|transaction|subscription)\b/i },
  { cat: 'tip', re: /\b(prediction|predict|accuracy|analysis|analyze|match model|model result)\b/i },
  { cat: 'feature', re: /\b(add|feature|suggestion|improve|wish|should have|request|support .* league|coverage)\b/i },
  { cat: 'bug', re: /\b(bug|broken|error|crash(?:es|ed|ing)?|not work|doesn't work|does not work|fail|glitch|issue|problem)\b/i },
  { cat: 'praise', re: /\b(love|great|awesome|thank|thanks|good job|excellent|nice|helpful)\b/i }
];

export function detectFeedbackCategory(message) {
  const value = String(message ?? '');
  for (const row of categories) if (row.re.test(value)) return row.cat;
  return 'general';
}

async function consumeFeedbackLimit(phone) {
  if (!pool) {
    if (env.NODE_ENV === 'test') return true;
    throw new Error('Persistent database is required to accept feedback.');
  }
  const result = await pool.query(
    `INSERT INTO feedback_rate_limits (phone, window_started_at, submissions)
     VALUES ($1, NOW(), 1)
     ON CONFLICT (phone) DO UPDATE SET
       window_started_at = CASE
         WHEN feedback_rate_limits.window_started_at < NOW() - ($2 * INTERVAL '1 second') THEN NOW()
         ELSE feedback_rate_limits.window_started_at END,
       submissions = CASE
         WHEN feedback_rate_limits.window_started_at < NOW() - ($2 * INTERVAL '1 second') THEN 1
         ELSE feedback_rate_limits.submissions + 1 END,
       updated_at = NOW()
     RETURNING submissions`,
    [String(phone || ''), RATE_WINDOW_SECONDS]
  );
  return Number(result.rows[0]?.submissions ?? RATE_MAX + 1) <= RATE_MAX;
}

export async function submitFeedback({ phone, text }) {
  const body = String(text ?? '').trim();
  if (!body || body.length < MIN_LEN) {
    return '📝 FEEDBACK\n\nTell us what to fix or improve (at least a short sentence).\n\nExamples:\n• FEEDBACK Form command is slow for UPL teams\n• REVIEW Please add AFCON fixtures\n• FEEDBACK Payment confirmed but Premium not activated\n\nYour message goes to the developers (SMART ELISHA 256).';
  }
  if (body.length > MAX_LEN) return `Please keep feedback under ${MAX_LEN} characters.`;

  let allowed;
  try {
    allowed = await consumeFeedbackLimit(phone);
  } catch (error) {
    logger.error({ error }, 'Feedback rate-limit storage unavailable');
    return 'Sorry — feedback is temporarily unavailable. Please try again later.';
  }
  if (!allowed) return 'You have sent several reviews recently. Please wait a few minutes before sending another. Thank you.';

  const category = detectFeedbackCategory(body);
  let id;
  try {
    if (!pool) throw new Error('Persistent feedback storage is unavailable.');
    const result = await pool.query(
      `INSERT INTO user_feedback (phone, category, message, status)
       VALUES ($1, $2, $3, 'new') RETURNING id`,
      [phone, category, body]
    );
    id = result.rows[0]?.id;
  } catch (error) {
    logger.error({ error }, 'Could not store user feedback');
    return 'Sorry — feedback could not be saved right now. Please try again later or message the admin directly.';
  }

  notifyAdmins({ id, phone, category, message: body }).catch((error) => {
    logger.warn({ error, feedbackId: id }, 'Could not notify admins of new feedback');
  });
  return `✅ Feedback received (#${id})\n\nCategory: ${category}\nThank you — the team at SMART ELISHA 256 will use this to fix and improve the bot.\n\nYou can send another review anytime with FEEDBACK or REVIEW.`;
}

async function notifyAdmins({ id, phone, category, message }) {
  const phones = String(env.PAYMENT_ADMIN_PHONES || '').split(',').map((p) => p.trim().replace(/[^0-9]/g, '')).filter(Boolean);
  if (!phones.length) return;
  const snippet = message.length > 200 ? `${message.slice(0, 200)}…` : message;
  const text = `📝 NEW FEEDBACK #${id}\nFrom: ${phone}\nCategory: ${category}\nMessage:\n${snippet}\n\nAdmin API: GET /admin/api/feedback`;
  const provider = createMessagingAdapter();
  for (const to of phones) await provider.sendMessage({ to, text });
}

export async function listFeedback({ status = null, category = null, search = null, limit = 50 } = {}) {
  if (!pool) return [];
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const values = [];
  const where = [];
  if (status) { values.push(status); where.push(`status = $${values.length}`); }
  if (category) { values.push(category); where.push(`category = $${values.length}`); }
  if (search) {
    values.push(`%${String(search).slice(0, 100)}%`);
    where.push(`(message ILIKE $${values.length} OR phone ILIKE $${values.length} OR CAST(id AS TEXT) ILIKE $${values.length})`);
  }
  values.push(lim);
  const sql = `SELECT id, phone, category, message, status, admin_notes, created_at, reviewed_at
    FROM user_feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'under_review' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
             created_at DESC LIMIT $${values.length}`;
  try { return (await pool.query(sql, values)).rows; }
  catch (error) { logger.error({ error }, 'Could not list feedback'); throw error; }
}

export async function getFeedbackSummary() {
  if (!pool) return { total: 0, byStatus: {}, byCategory: {} };
  const result = await pool.query(`
    SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'new')::int AS new,
      COUNT(*) FILTER (WHERE status = 'under_review')::int AS under_review,
      COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved,
      COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
    FROM user_feedback`);
  const categoriesResult = await pool.query('SELECT category, COUNT(*)::int AS count FROM user_feedback GROUP BY category');
  const row = result.rows[0] || {};
  return {
    total: Number(row.total || 0),
    byStatus: { new: Number(row.new || 0), under_review: Number(row.under_review || 0), in_progress: Number(row.in_progress || 0), resolved: Number(row.resolved || 0), rejected: Number(row.rejected || 0) },
    byCategory: Object.fromEntries(categoriesResult.rows.map((r) => [r.category, Number(r.count)]))
  };
}

export async function updateFeedback(id, { status, notes = null, category = null } = {}) {
  const allowedStatuses = ['new', 'under_review', 'in_progress', 'resolved', 'rejected'];
  if (!allowedStatuses.includes(status)) return { ok: false, message: 'Invalid feedback status' };
  const allowedCategories = ['bug', 'feature', 'payment', 'tip', 'praise', 'general'];
  if (category !== null && !allowedCategories.includes(category)) return { ok: false, message: 'Invalid feedback category' };
  if (!pool) return { ok: false, message: 'Persistent feedback storage is unavailable' };
  try {
    const result = await pool.query(
      `UPDATE user_feedback SET status = $2,
        admin_notes = CASE WHEN $3::text IS NULL THEN admin_notes ELSE $3 END,
        category = COALESCE($4, category),
        reviewed_at = CASE WHEN $2 IN ('under_review','in_progress','resolved','rejected') THEN COALESCE(reviewed_at, NOW()) ELSE reviewed_at END
       WHERE id = $1 RETURNING id, status`,
      [Number(id), status, notes, category]
    );
    if (!result.rows.length) return { ok: false, message: 'Feedback not found' };
    return { ok: true, message: `Feedback #${id} updated to ${status}`, feedback: result.rows[0] };
  } catch (error) {
    logger.error({ error, id }, 'Could not update feedback');
    return { ok: false, message: 'Could not update feedback' };
  }
}

export async function markFeedbackReviewed(id, { notes = null } = {}) {
  return updateFeedback(id, { status: 'under_review', notes });
}
