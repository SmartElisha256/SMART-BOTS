import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';
const TIMEOUT_MS = 15000;

export function detectFootballIntent(input) {
  const original = String(input ?? '').trim();
  const text = original
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'unknown';

  // Concept/learning requests take priority unless the user also asks for a
  // specific match forecast or match-specific/current evidence.
  const conceptIntent = /\b(what is|what are|what does|define|meaning of|explain|teach me|how does|how do|rules of|difference between|why do|how to understand)\b/i.test(text);
  const conceptTerms = /\b(xg|expected goals|btts|double chance|offside|formation|football tactics|pressing|possession|counterattack|counter attack|4-3-3|4-2-3-1|false nine|high line|set pieces?|yellow cards?|red cards?|penalt(?:y|ies)|corner kicks?)\b/i.test(text);
  const matchSeparator = /\b(?:vs\.?|v\.?|versus|against)\b/i.test(text);
  const explicitForecast = /\b(predict|prediction|forecast|who will win|who might win|who wins|chance of winning|chance of a draw|match analysis|analy[sz]e|compare these teams|compare the teams)\b/i.test(text);
  const explicitData = /\b(live|right now|currently|latest|recent|last \d+|last five|last five games|form|head.to.head|h2h|standings|league table|table position|injur(?:y|ies)|squad news|team news|lineup|line-ups|starting eleven|shots|shots on target|possession stats|current score|live score|fixture|fixtures|upcoming match|historical record|recent results)\b/i.test(text);
  const hasTwoTeamShape = matchSeparator && text.split(/\b(?:vs\.?|v\.?|versus|against)\b/i).length >= 2;
  const marketTerms = /\b(1x2|double chance|over\s*\/?\s*under|btts|both teams to score|correct score|expected goals|xg|probabilit(?:y|ies)|goal markets?)\b/i.test(text);

  if (conceptIntent && conceptTerms && !hasTwoTeamShape && !explicitForecast && !explicitData) {
    return 'ai_only';
  }

  // A match-specific answer benefits from verified data first, then the model,
  // followed by an explanation grounded only in returned evidence.
  if (hasTwoTeamShape && (explicitData || /\b(today|tonight|tomorrow|this week|team stats|statistics|stats|form|h2h|head.to.head|injur(?:y|ies)|lineup|line-ups|squad)\b/i.test(text))) {
    return 'data_ml_ai';
  }

  // Market labels without a named match are underspecified; do not launch a model.
  if (marketTerms && !hasTwoTeamShape && !explicitForecast) return 'unknown';

  if (hasTwoTeamShape || (explicitForecast && (marketTerms || /\bmatch|team|teams|football|soccer\b/i.test(text)))) {
    return 'ml_ai';
  }

  if (explicitData) return 'data_only';
  if (conceptIntent || conceptTerms || /\b(football|soccer|match|team|player|league|coach|manager|tournament|referee)\b/i.test(text)) {
    return 'ai_only';
  }
  return 'unknown';
}

export async function predictFootballMatch({ homeTeam, awayTeam, kickoff = null }) {
  if (!homeTeam || !awayTeam || homeTeam.trim().toLowerCase() === awayTeam.trim().toLowerCase()) {
    throw new Error('Please provide two different team names.');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ['predict.py', '--request-stdin'], {
      cwd: analyticsDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error('Football ML prediction timed out.'));
    }, TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 1_000_000) {
        child.kill('SIGKILL');
        finish(reject, new Error('Football ML prediction output was too large.'));
      }
    });
    child.stderr.on('data', chunk => { stderr += chunk.slice(0, 4000); });
    child.on('error', error => {
      finish(reject, new Error(error.code === 'ENOENT'
        ? 'Python prediction runtime is unavailable. Install Python and configure PYTHON_BIN.'
        : 'Could not start the football ML prediction process.'));
    });
    child.on('close', code => {
      if (settled) return;
      let payload;
      try { payload = JSON.parse(stdout); }
      catch { return finish(reject, new Error('Python ML dependencies or trained model files are not available on the server.')); }
      if (code !== 0 || payload.error) {
        return finish(reject, new Error(payload.error || 'Football ML prediction failed.'));
      }
      finish(resolve, payload);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({
      home_team: homeTeam.trim(),
      away_team: awayTeam.trim(),
      kickoff
    }));
  });
}

export function formatMlPrediction(prediction) {
  const pct = value => `${(Number(value) * 100).toFixed(1)}%`;
  const result = prediction.match_result ?? {};
  const ml = prediction.machine_learning_result ?? {};
  const dc = prediction.double_chance ?? {};
  const goals = prediction.goal_markets ?? {};
  const btts = prediction.btts ?? {};
  const xg = prediction.expected_goals ?? {};
  const scores = prediction.correct_score ?? [];
  const fixture = prediction.fixture ?? {};
  const warnings = prediction.data_quality?.warnings ?? [];
  const lines = [
    `📊 ML MATCH PREDICTION: ${fixture.home_team ?? 'Home'} vs ${fixture.away_team ?? 'Away'}`,
    '',
    `1X2 (score model): Home ${pct(result.home_win)} | Draw ${pct(result.draw)} | Away ${pct(result.away_win)}`,
    `ML classifier comparison: Home ${pct(ml.home_win)} | Draw ${pct(ml.draw)} | Away ${pct(ml.away_win)}`,
    `Double chance: 1X ${pct(dc['1X'])} | X2 ${pct(dc.X2)} | 12 ${pct(dc['12'])}`,
    `Over 1.5: ${pct(goals.over_1_5)} | Over 2.5: ${pct(goals.over_2_5)} | Under 2.5: ${pct(goals.under_2_5)}`,
    `BTTS: Yes ${pct(btts.yes)} | No ${pct(btts.no)}`,
    `Expected goals: ${fixture.home_team ?? 'Home'} ${Number(xg.home).toFixed(2)} - ${Number(xg.away).toFixed(2)} ${fixture.away_team ?? 'Away'}`,
    `Top correct-score estimates: ${scores.slice(0, 3).map(item => `${item.score} (${pct(item.probability)})`).join(', ') || 'unavailable'}`,
    `Confidence: ${prediction.confidence?.level ?? 'unavailable'}; historical matches: ${prediction.data_quality?.historical_matches ?? 'unknown'}`
  ];
  if (warnings.length) lines.push('', `Data warnings: ${warnings.join(' ')}`);
  lines.push('', 'These are model estimates, not guarantees. Do not treat them as certain outcomes.');
  return lines.join('\n');
}
