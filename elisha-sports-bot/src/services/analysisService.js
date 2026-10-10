import { env } from '../config/env.js';

function summarizeForm(form = []) {
  if (!form.length) return null;
  const first = form[0];
  return {
    matches: form.length,
    wins: first.wins ?? form.filter((m) => m.result === 'W').length,
    draws: first.draws ?? form.filter((m) => m.result === 'D').length,
    losses: first.losses ?? form.filter((m) => m.result === 'L').length,
    goalsFor: form.reduce((sum, m) => sum + (Number(m.scored) || 0), 0),
    goalsAgainst: form.reduce((sum, m) => sum + (Number(m.conceded) || 0), 0),
    results: form.map((m) => m.result).join('')
  };
}

function fallbackAnalysis(teamA, teamB, formA, formB, h2h) {
  const a = summarizeForm(formA);
  const b = summarizeForm(formB);
  const lines = [`📊 MATCH ANALYSIS: ${teamA} vs ${teamB}`];
  if (a) lines.push(`\n${teamA} recent form: ${a.wins}W-${a.draws}D-${a.losses}L in ${a.matches} matches; goals ${a.goalsFor} scored, ${a.goalsAgainst} conceded.`);
  else lines.push(`\nRecent form for ${teamA} is unavailable.`);
  if (b) lines.push(`${teamB} recent form: ${b.wins}W-${b.draws}D-${b.losses}L in ${b.matches} matches; goals ${b.goalsFor} scored, ${b.goalsAgainst} conceded.`);
  else lines.push(`Recent form for ${teamB} is unavailable.`);
  if (h2h && h2h.matches > 0) {
    lines.push(`\nLast ${h2h.matches} head-to-head matches: ${teamA} ${h2h.wins_a} wins, ${teamB} ${h2h.wins_b} wins, ${h2h.draws} draws.`);
  } else {
    lines.push('\nHead-to-head record is unavailable.');
  }
  if (!a && !b && (!h2h || !h2h.matches)) {
    return 'I cannot analyze this match yet because reliable form and head-to-head data are unavailable. Configure a real sports-data provider first.';
  }
  lines.push('\nAssessment: these statistics describe recent performance only; they do not guarantee the match result. No probability is shown because there is not enough validated data for a calibrated forecast.');
  return lines.join('\n');
}

async function askAI({ teamA, teamB, formA, formB, h2h }) {
  if (!env.OPENAI_API_KEY) return null;
  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: 'You are a cautious football statistics analyst. Use only the supplied data. Never invent injuries, lineups, odds, live events, tactics, or statistics. State when information is missing. Explain strengths, risks, and uncertainty in concise WhatsApp-friendly text. Do not guarantee outcomes or present betting as certain.'
        },
        {
          role: 'user',
          content: JSON.stringify({ match: { teamA, teamB }, recentForm: { [teamA]: formA, [teamB]: formB }, headToHead: h2h })
        }
      ],
      max_output_tokens: 450
    })
  });
  if (!response.ok) throw new Error(`AI analysis API returned HTTP ${response.status}`);
  const data = await response.json();
  const text = data.output?.flatMap((item) => item.content ?? []).filter((item) => item.type === 'output_text').map((item) => item.text).join('\n').trim();
  return text || null;
}

export async function analyzeMatch({ teamA, teamB, formA = [], formB = [], h2h = null }) {
  const deterministic = fallbackAnalysis(teamA, teamB, formA, formB, h2h);
  if (!env.OPENAI_API_KEY || deterministic.startsWith('I cannot analyze')) return deterministic;
  try {
    const aiText = await askAI({ teamA, teamB, formA, formB, h2h });
    return aiText ? `🤖 AI MATCH ANALYSIS\n\n${aiText}\n\nData-based analysis, not a guaranteed result.` : deterministic;
  } catch {
    return `${deterministic}\n\n(AI service unavailable; showing the statistics summary instead.)`;
  }
}

export { summarizeForm };
