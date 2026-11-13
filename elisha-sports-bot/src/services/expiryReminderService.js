import pool from '../database/pool.js';
import { createMessagingAdapter } from '../providers/messaging/factory.js';
import { logger } from '../utils/logger.js';

/**
 * Find Premium subscriptions expiring within the next 24 hours and notify once.
 */
export async function sendPremiumExpiryReminders() {
  if (!pool) {
    return { ok: true, sent: 0, note: 'Database required for expiry reminders' };
  }

  const due = await pool.query(
    `SELECT id, phone, expires_at
       FROM subscriptions
      WHERE is_active = TRUE
        AND plan = 'premium'
        AND expires_at IS NOT NULL
        AND expires_at > NOW()
        AND expires_at <= NOW() + INTERVAL '24 hours'`
  );

  const provider = createMessagingAdapter();
  let sent = 0;

  for (const row of due.rows) {
    try {
      const already = await pool.query(
        `SELECT 1 FROM expiry_reminders WHERE phone = $1 AND expires_at = $2`,
        [row.phone, row.expires_at]
      );
      if (already.rowCount) continue;

      const when = new Date(row.expires_at).toLocaleString('en-UG', {
        timeZone: 'Africa/Kampala',
        dateStyle: 'medium',
        timeStyle: 'short'
      });
      const text =
        '⏰ PREMIUM REMINDER\n\n' +
        'Your ELISHA SPORTS BOT Premium access expires around ' + when + ' (EAT).\n' +
        'To renew without interruption, reply UPGRADE and complete Mobile Money, then send PAY WEEK (or DAY/MONTH) with your transaction ID.\n\n' +
        'Thank you for supporting SMART ELISHA 256.';

      await provider.sendMessage({ to: row.phone, text });
      await pool.query(
        `INSERT INTO expiry_reminders (phone, subscription_id, expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [row.phone, row.id, row.expires_at]
      );
      sent += 1;
    } catch (error) {
      logger.error({ error, phone: row.phone }, 'Expiry reminder failed');
    }
  }

  return { ok: true, sent, candidates: due.rowCount };
}
