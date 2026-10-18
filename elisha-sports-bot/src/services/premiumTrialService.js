import pool from '../database/pool.js';
import { env } from '../config/env.js';
import { findUserByPhone } from './userService.js';

const inMemoryTrials = new Map();

export function isWithinPremiumTrial(createdAt, now = Date.now()) {
  const created = new Date(createdAt).getTime();
  return Number.isFinite(created) && created <= now &&
    now - created < env.NEW_USER_TRIAL_HOURS * 60 * 60 * 1000;
}

/**
 * Grants one limited Premium analysis request to a new account at a time.
 * Trial eligibility is anchored to users.created_at, so returning users cannot
 * restart their trial by sending another message.
 */
export async function claimPremiumTrialRequest(phone) {
  const user = await findUserByPhone(phone);
  if (!user || !isWithinPremiumTrial(user.created_at)) {
    return { allowed: false, reason: 'expired', remaining: 0 };
  }

  const limit = env.NEW_USER_TRIAL_ANALYSIS_LIMIT;
  if (!pool) {
    const key = String(phone);
    const trial = inMemoryTrials.get(key) ?? { startedAt: new Date(user.created_at).getTime(), used: 0 };
    if (trial.startedAt !== new Date(user.created_at).getTime() || trial.used >= limit) {
      return { allowed: false, reason: 'limit', remaining: 0 };
    }
    trial.used += 1;
    inMemoryTrials.set(key, trial);
    return { allowed: true, remaining: limit - trial.used, limit };
  }

  const result = await pool.query(
    `INSERT INTO premium_trial_usage (phone, trial_started_at, requests_used)
     VALUES ($1, $2, 1)
     ON CONFLICT (phone)
     DO UPDATE SET
       requests_used = premium_trial_usage.requests_used + 1,
       updated_at = NOW()
     WHERE premium_trial_usage.trial_started_at = EXCLUDED.trial_started_at
       AND premium_trial_usage.requests_used < $3
     RETURNING requests_used`,
    [phone, user.created_at, limit]
  );

  if (!result.rows[0]) {
    return { allowed: false, reason: 'limit', remaining: 0 };
  }
  const used = Number(result.rows[0].requests_used);
  return { allowed: true, remaining: limit - used, limit };
}
