import pool from '../database/pool.js';
import { logger } from '../utils/logger.js';

const memoryLogs = [];

/**
 * Persist a model output for later accuracy scoring.
 * Does not claim the prediction is correct — only stores what was shown.
 */
export async function logPrediction({
  phone = null,
  prediction,
  sourceCommand = 'analyze'
} = {}) {
  if (!prediction) return null;

  const fixture = prediction.fixture ?? {};
  const result = prediction.match_result ?? {};
  const conf = prediction.confidence ?? {};
  const dq = prediction.data_quality ?? {};

  const probs = [
    { key: 'home', value: Number(result.home_win) },
    { key: 'draw', value: Number(result.draw) },
    { key: 'away', value: Number(result.away_win) }
  ].filter((row) => Number.isFinite(row.value));
  probs.sort((a, b) => b.value - a.value);
  const predicted1x2 = probs[0]?.key ?? null;

  const row = {
    phone,
    home_team: fixture.home_team ?? 'Home',
    away_team: fixture.away_team ?? 'Away',
    kickoff: fixture.kickoff ?? null,
    predicted_1x2: predicted1x2,
    home_win_prob: Number.isFinite(Number(result.home_win)) ? Number(result.home_win) : null,
    draw_prob: Number.isFinite(Number(result.draw)) ? Number(result.draw) : null,
    away_win_prob: Number.isFinite(Number(result.away_win)) ? Number(result.away_win) : null,
    confidence_level: conf.level ?? null,
    historical_matches: dq.historical_matches ?? null,
    data_quality_status: Array.isArray(dq.warnings) && dq.warnings.length ? 'partial' : 'ok',
    model_version: prediction.model?.name || prediction.model || 'unknown',
    source_command: sourceCommand
  };

  if (!pool) {
    const id = memoryLogs.length + 1;
    memoryLogs.push({ id, ...row, created_at: new Date().toISOString() });
    return id;
  }

  try {
    const result = await pool.query(
      `INSERT INTO prediction_logs (
         phone, home_team, away_team, kickoff, predicted_1x2,
         home_win_prob, draw_prob, away_win_prob, confidence_level,
         historical_matches, data_quality_status, model_version, source_command
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id`,
      [
        row.phone, row.home_team, row.away_team, row.kickoff, row.predicted_1x2,
        row.home_win_prob, row.draw_prob, row.away_win_prob, row.confidence_level,
        row.historical_matches, row.data_quality_status, row.model_version, row.source_command
      ]
    );
    return result.rows[0]?.id ?? null;
  } catch (error) {
    logger.warn({ error }, 'Could not write prediction log (table may be missing)');
    return null;
  }
}

/**
 * Whether the model output is strong enough to present as a tip.
 * Weak data → refuse pick (accuracy policy).
 */
export function isPredictionStrongEnough(prediction) {
  if (!prediction) {
    return { ok: false, reason: 'No model output was produced.' };
  }
  const dq = prediction.data_quality ?? {};
  const matches = Number(dq.historical_matches);
  const warnings = Array.isArray(dq.warnings) ? dq.warnings : [];
  const conf = String(prediction.confidence?.level ?? '').toLowerCase();

  if (Number.isFinite(matches) && matches < 20) {
    return {
      ok: false,
      reason: `Only ${matches} historical matches are available. That is too few for a reliable Premium-grade tip.`
    };
  }
  if (conf === 'low' || conf === 'very_low') {
    return {
      ok: false,
      reason: `Model confidence is ${conf}. I will not present a tip as reliable under low confidence.`
    };
  }
  if (warnings.some((w) => /demo|synthetic|unavailable|insufficient/i.test(String(w)))) {
    return {
      ok: false,
      reason: 'Data quality warnings indicate this output should not be sold as a tip.'
    };
  }
  return { ok: true, reason: null };
}

export async function getPredictionAccuracySummary({ limit = 100 } = {}) {
  if (!pool) {
    const resolved = memoryLogs.filter((row) => row.actual_1x2);
    const hits = resolved.filter((row) => row.actual_1x2 === row.predicted_1x2).length;
    return {
      resolved: resolved.length,
      hits,
      hitRate: resolved.length ? hits / resolved.length : null,
      note: 'In-memory only (no database)'
    };
  }
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE actual_1x2 IS NOT NULL) AS resolved,
         COUNT(*) FILTER (WHERE actual_1x2 IS NOT NULL AND actual_1x2 = predicted_1x2) AS hits
       FROM prediction_logs
       WHERE created_at > NOW() - INTERVAL '90 days'`
    );
    const resolved = Number(result.rows[0]?.resolved ?? 0);
    const hits = Number(result.rows[0]?.hits ?? 0);
    return {
      resolved,
      hits,
      hitRate: resolved ? hits / resolved : null,
      windowDays: 90
    };
  } catch (error) {
    logger.warn({ error }, 'Accuracy summary unavailable');
    return { resolved: 0, hits: 0, hitRate: null, error: error.message };
  }
}
