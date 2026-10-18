import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';
const TIMEOUT_MS = 15000;

export function detectFootballIntent(input) {
  const text = String(input ?? '').trim().toLowerCase();
  if (!text) return 'unknown';

  const conceptQuestion = /\b(what is|what does|define|meaning of|explain)\s+(?:an?\s+)?(?:xg|expected goals|btts|double chance|offside|4-3-3|formation|football tactics)\b/i;
  if (conceptQuestion.test(text) && !/\b(?:vs?\.?|versus|against|predict|prediction|probabilit|today'?s? tip|betting|odds)\b/i.test(text)) return 'ai_only';

  const predictionIntent = /\b(predict|prediction|predicting|who will win|who might win|who wins|best pick|tips? today|today'?s? tips?|betting|odds|1x2|double chance|over\s*\/?\s*under|btts|both teams to score|correct score|expected goals|xg|probabilit(?:y|ies)|chance of (?:winning|a draw)|match analysis|analy[sz]e .{1,80}\b(?:vs?\.?|versus|against)\b)\b/i;
  const matchup = /\b.{2,60}\s+(?:vs?\.?|versus|against)\s+.{2,60}\b/i;
  if (predictionIntent.test(text) || matchup.test(text)) return 'ml_ai';

  const conceptIntent = /\b(what is|explain|define|how does|how do|teach me|rules of|meaning of|formation|tactics|offside|penalty rule|referee|football history|what does .{1,30} mean)\b/i;
  if (conceptIntent.test(text)) return 'ai_only';
  return 'ai_only';
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
      catch { return finish(reject, new Error(stderr || 'Football ML returned invalid output.')); }
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
