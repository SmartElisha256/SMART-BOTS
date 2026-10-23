import pool from '../database/pool.js';
import { getUserSubscriptions } from './subscriptionService.js';
import { logger } from '../utils/logger.js';

const memory = new Map();
const FREE_REPLIES_BEFORE_PROMPT = Number(process.env.CONVERSION_FREE_REPLIES || 3);
const PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const UPGRADE_BLURB =
  '\n\n⭐ Enjoying ELISHA SPORTS BOT?\n' +
  'Premium unlocks full match analysis (ML + context), historical seasons, and higher limits.\n' +
  'Plans from UGX 1,000/day. Reply UPGRADE for Mobile Money steps.\n' +
  'Tips are statistical estimates — never guaranteed.';

async function isPremium(phone) {
  const subs = await getUserSubscriptions(phone);
  return subs.some(
    (s) => String(s.plan || '').toLowerCase() === 'premium' && s.is_active !== false
  );
}

/**
 * After a few free useful replies, append a soft upgrade prompt once per day.
 * Never spam; never claim guaranteed winnings.
 */
export async function maybeAppendUpgradePrompt(phone, replyText) {
  if (!phone || !replyText) return replyText;
  try {
    if (await isPremium(phone)) return replyText;

    let state;
    if (!pool) {
      state = memory.get(phone) || { free_replies: 0, last_prompt_at: null };
      state.free_replies += 1;
      memory.set(phone, state);
    } else {
      await pool.query(
        `INSERT INTO conversion_prompts (phone, free_replies, updated_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (phone) DO UPDATE SET
           free_replies = conversion_prompts.free_replies + 1,
           updated_at = NOW()`,
        [phone]
      );
      const found = await pool.query(
        'SELECT free_replies, last_prompt_at FROM conversion_prompts WHERE phone = $1',
        [phone]
      );
      state = found.rows[0] || { free_replies: 1, last_prompt_at: null };
    }

    const freeReplies = Number(state.free_replies || 0);
    const lastPrompt = state.last_prompt_at ? new Date(state.last_prompt_at).getTime() : 0;
    const cooledDown = !lastPrompt || Date.now() - lastPrompt >= PROMPT_COOLDOWN_MS;

    if (freeReplies >= FREE_REPLIES_BEFORE_PROMPT && cooledDown) {
      if (pool) {
        await pool.query(
          'UPDATE conversion_prompts SET last_prompt_at = NOW(), updated_at = NOW() WHERE phone = $1',
          [phone]
        );
      } else {
        state.last_prompt_at = new Date().toISOString();
        memory.set(phone, state);
      }
      return replyText + UPGRADE_BLURB;
    }
  } catch (error) {
    logger.warn({ error, phone }, 'Conversion prompt skipped');
  }
  return replyText;
}

export async function markConverted(phone) {
  if (!pool) {
    const state = memory.get(phone) || { free_replies: 0 };
    state.converted_at = new Date().toISOString();
    memory.set(phone, state);
    return;
  }
  try {
    await pool.query(
      `INSERT INTO conversion_prompts (phone, converted_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (phone) DO UPDATE SET converted_at = NOW(), updated_at = NOW()`,
      [phone]
    );
  } catch (error) {
    logger.warn({ error, phone }, 'Could not mark conversion');
  }
}
