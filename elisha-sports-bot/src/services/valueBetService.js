/**
 * Value-check helper for WhatsApp (product path).
 *
 * Port of football-analytics/betting.py evaluate_market + stake sizing.
 * Research backtests in BETTING.md show the model has no proven edge over
 * bookmaker odds; this service still runs the math so users see transparent
 * PASS / edge numbers, and defaults to "no pick" when thresholds fail.
 *
 * Never places bets. Paper-analysis only.
 */

export const SELECTIONS = ['home', 'draw', 'away'];

/** Defaults match Python BettingConfig (strict). */
export const DEFAULT_VALUE_CONFIG = Object.freeze({
  modelWeight: 0.3,
  minEdge: 0.02,
  minEv: 0.04,
  minOdds: 1.4,
  maxOdds: 6.0,
  kellyFraction: 0.2,
  maxStakePct: 0.02,
  maxExposurePct: 0.08
});

function cleanOdds(odds) {
  const out = {};
  for (const sel of SELECTIONS) {
    const o = Number(odds[sel]);
    if (!Number.isFinite(o) || o <= 1.01) {
      throw new Error(`Invalid decimal odds for ${sel}: ${odds[sel]}`);
    }
    out[sel] = o;
  }
  return out;
}

/** De-vig multiplicative method → fair probabilities summing to 1. */
export function devigMarket(odds) {
  const cleaned = cleanOdds(odds);
  const inv = Object.fromEntries(SELECTIONS.map((s) => [s, 1 / cleaned[s]]));
  const total = SELECTIONS.reduce((a, s) => a + inv[s], 0);
  return Object.fromEntries(SELECTIONS.map((s) => [s, inv[s] / total]));
}

export function overround(odds) {
  const cleaned = cleanOdds(odds);
  return SELECTIONS.reduce((a, s) => a + 1 / cleaned[s], 0) - 1;
}

export function blendProbabilities(model, market, modelWeight = 0.3) {
  const w = Math.min(1, Math.max(0, Number(modelWeight) || 0));
  return Object.fromEntries(
    SELECTIONS.map((s) => [s, w * model[s] + (1 - w) * market[s]])
  );
}

function fullKelly(p, odds) {
  if (odds <= 1) return 0;
  const b = odds - 1;
  const edge = p * odds - 1;
  if (edge <= 0) return 0;
  return edge / b;
}

/**
 * @param {object} modelProbs keys home_win, draw, away_win (0–1)
 * @param {object} odds keys home, draw, away (decimal)
 * @param {object} [config]
 */
export function evaluateMarket(modelProbs, odds, config = {}) {
  const cfg = { ...DEFAULT_VALUE_CONFIG, ...config };
  const cleanedOdds = cleanOdds(odds);

  let model = {
    home: Number(modelProbs.home_win),
    draw: Number(modelProbs.draw),
    away: Number(modelProbs.away_win)
  };
  const msum = SELECTIONS.reduce((a, s) => a + (Number.isFinite(model[s]) ? model[s] : 0), 0);
  if (!(msum > 0)) {
    throw new Error('Model probabilities must be positive numbers.');
  }
  model = Object.fromEntries(SELECTIONS.map((s) => [s, model[s] / msum]));

  const market = devigMarket(cleanedOdds);
  const blended = blendProbabilities(model, market, cfg.modelWeight);

  const rows = SELECTIONS.map((sel) => {
    const o = cleanedOdds[sel];
    const p = blended[sel];
    const edge = p - market[sel];
    const ev = p * o - 1;
    const reasons = [];
    if (edge < cfg.minEdge) reasons.push(`edge ${(edge * 100).toFixed(1)}% below min ${(cfg.minEdge * 100).toFixed(0)}%`);
    if (ev < cfg.minEv) reasons.push(`EV ${(ev * 100).toFixed(1)}% below min ${(cfg.minEv * 100).toFixed(0)}%`);
    if (o < cfg.minOdds || o > cfg.maxOdds) {
      reasons.push(`odds ${o.toFixed(2)} outside ${cfg.minOdds.toFixed(2)}–${cfg.maxOdds.toFixed(2)}`);
    }
    const kelly = fullKelly(p, o);
    return {
      selection: sel,
      odds: o,
      modelProb: model[sel],
      marketProb: market[sel],
      blendedProb: p,
      edge,
      ev,
      fullKelly: kelly,
      stakePct: Math.min(cfg.kellyFraction * kelly, cfg.maxStakePct),
      qualifies: reasons.length === 0,
      reasons
    };
  });

  const qualifying = rows.filter((r) => r.qualifies);
  const best = qualifying.length
    ? qualifying.reduce((a, b) => (b.ev > a.ev ? b : a))
    : null;

  return {
    selections: rows,
    best,
    overround: overround(cleanedOdds),
    config: cfg
  };
}

export function stakeFor(best, bankroll, openExposure = 0, config = {}) {
  const cfg = { ...DEFAULT_VALUE_CONFIG, ...config };
  const br = Number(bankroll);
  if (!Number.isFinite(br) || br <= 0) return 0;
  if (!best || !best.qualifies) return 0;
  let stake = br * best.stakePct;
  const room = Math.max(0, cfg.maxExposurePct * br - openExposure);
  stake = Math.min(stake, room);
  return Math.floor(stake * 100) / 100;
}

/**
 * Format WhatsApp reply. Always includes research disclaimer.
 */
export function formatValueAnalysis({
  home,
  away,
  analysis,
  bankroll = null,
  dataQualityOk = true,
  strengthOk = true,
  strengthReason = null
}) {
  const lines = [];
  lines.push(`📊 VALUE CHECK — ${home} vs ${away}`);
  lines.push('');
  lines.push('⚠️ RESEARCH TOOL ONLY. Walk-forward tests on our data show the model has NO proven edge over bookmaker odds. PASS is the normal outcome. This never places a bet.');
  lines.push('');

  if (!dataQualityOk || !strengthOk) {
    lines.push(`⛔ No value pick: ${strengthReason || 'model data quality too weak for a stake suggestion.'}`);
    lines.push('');
    lines.push('You can still use ANALYZE for transparent probabilities without stake advice.');
    return lines.join('\n');
  }

  const label = { home: 'Home', draw: 'Draw', away: 'Away' };
  for (const row of analysis.selections) {
    const tag = row.qualifies ? '✓' : '·';
    lines.push(
      `${tag} ${label[row.selection]} @ ${row.odds.toFixed(2)} | model ${(row.modelProb * 100).toFixed(1)}% | market ${(row.marketProb * 100).toFixed(1)}% | blend ${(row.blendedProb * 100).toFixed(1)}% | EV ${(row.ev * 100).toFixed(1)}%`
    );
  }
  lines.push('');
  lines.push(`Book overround: ${(analysis.overround * 100).toFixed(1)}%`);
  lines.push(`Rules: edge ≥ ${(analysis.config.minEdge * 100).toFixed(0)} pts, EV ≥ ${(analysis.config.minEv * 100).toFixed(0)}%, odds ${analysis.config.minOdds}–${analysis.config.maxOdds}, model weight ${(analysis.config.modelWeight * 100).toFixed(0)}%`);
  lines.push('');

  if (analysis.best) {
    const b = analysis.best;
    lines.push(`Candidate (paper only): ${label[b.selection]} @ ${b.odds.toFixed(2)}`);
    lines.push(`Edge ${(b.edge * 100).toFixed(1)}% · EV ${(b.ev * 100).toFixed(1)}% · Kelly stake cap ${(b.stakePct * 100).toFixed(2)}% of bankroll`);
    if (Number.isFinite(Number(bankroll)) && Number(bankroll) > 0) {
      const stake = stakeFor(b, Number(bankroll));
      lines.push(`Illustrative paper stake on ${Number(bankroll)} bankroll: ${stake}`);
    } else {
      lines.push('Add BANKROLL <amount> for an illustrative paper stake size.');
    }
  } else {
    lines.push('✅ PASS — no selection meets the value rules. That is expected most of the time.');
  }

  lines.push('');
  lines.push('CLI research: python3 football-analytics/bet.py suggest … (see BETTING.md)');
  return lines.join('\n');
}

/**
 * Parse "VALUE Home vs Away 1.80 3.90 4.60 [BANKROLL 1000]"
 * Odds order: home, draw, away (decimal).
 */
export function parseValueArgs(raw) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return { error: 'Usage: VALUE Home vs Away 1.80 3.90 4.60 [BANKROLL 1000]\nOdds order: home draw away (decimal).' };
  }

  let bankroll = null;
  let body = text;
  const br = text.match(/\bbankroll\s+(\d+(?:\.\d+)?)\s*$/i);
  if (br) {
    bankroll = Number(br[1]);
    body = text.slice(0, br.index).trim();
  }

  const oddsMatch = body.match(/(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
  if (!oddsMatch) {
    return { error: 'Need three decimal odds (home draw away). Example: VALUE Arsenal vs Chelsea 1.80 3.90 4.60' };
  }
  const odds = {
    home: Number(oddsMatch[1]),
    draw: Number(oddsMatch[2]),
    away: Number(oddsMatch[3])
  };
  const teamsPart = body.slice(0, oddsMatch.index).trim();
  let home;
  let away;
  const vs = teamsPart.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
  if (vs) {
    home = vs[1].trim();
    away = vs[2].trim();
  } else {
    const parts = teamsPart.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      return { error: 'Need two team names before the odds. Example: VALUE Arsenal vs Chelsea 1.80 3.90 4.60' };
    }
    const mid = Math.floor(parts.length / 2);
    home = parts.slice(0, mid).join(' ');
    away = parts.slice(mid).join(' ');
  }

  return { home, away, odds, bankroll };
}
