import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';

function percent(value) {
  return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : 'unavailable';
}

export function formatFootballPrediction(prediction) {
  const fixture = prediction?.fixture ?? {};
  const home = fixture.home_team ?? 'Home team';
  const away = fixture.away_team ?? 'Away team';
  const outcomes = prediction?.match_result ?? {};
  const outlook = prediction?.statistical_outlook ?? {};
  const goals = prediction?.expected_goals ?? {};
  const quality = prediction?.data_quality ?? {};
  const ordered = [
    [`${home} win`, outcomes.home_win],
    ['Draw', outcomes.draw],
    [`${away} win`, outcomes.away_win]
  ].sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
  const lines = [
    `📊 MODEL MATCH OUTLOOK: ${home} vs ${away}`,
    '',
    'Estimated match-result probabilities:',
    `• ${home} win: ${percent(outcomes.home_win)}`,
    `• Draw: ${percent(outcomes.draw)}`,
    `• ${away} win: ${percent(outcomes.away_win)}`,
    '',
    `🤖 Highest-probability outcome: ${outlook.most_likely_single_outcome ?? ordered[0][0]} (${percent(outlook.model_probability ?? ordered[0][1])})`,
    'Why the model leans this way:'
  ];
  for (const reason of (Array.isArray(outlook.reasons) ? outlook.reasons : []).slice(0, 4)) {
    lines.push(`• ${reason}`);
  }
  if (Number.isFinite(Number(goals.home)) && Number.isFinite(Number(goals.away))) {
    lines.push('', `Expected goals (model estimate): ${home} ${Number(goals.home).toFixed(2)} — ${Number(goals.away).toFixed(2)} ${away}`);
  }
  lines.push('', `Data quality: ${quality.status ?? 'unknown'}; historical matches used: ${quality.historical_matches ?? 'unknown'}.`);
  if (Array.isArray(quality.warnings)) {
    for (const warning of quality.warnings.slice(0, 2)) lines.push(`⚠️ ${warning}`);
  }
  lines.push('', 'Disclaimer: These are uncertain statistical estimates, not guarantees or betting recommendations. The model may be inaccurate or poorly calibrated.');
  return lines.join('\n');
}

export function getFootballPrediction({ homeTeam, awayTeam }) {
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
      clearTimeout(timeout);
      fn(value);
    };
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error('Football prediction timed out.'));
    }, 15000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 1_000_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.slice(0, 4000); });
    child.on('error', (error) => finish(reject, new Error(
      error.code === 'ENOENT' ? 'Python is unavailable. Install Python and configure PYTHON_BIN.' : 'Could not start the football prediction process.'
    )));
    child.on('close', (code) => {
      let payload;
      try { payload = JSON.parse(stdout); } catch {
        return finish(reject, new Error(stderr || 'Prediction output was invalid.'));
      }
      if (code !== 0 || payload.error) return finish(reject, new Error(payload.error || 'Prediction process failed.'));
      return finish(resolve, formatFootballPrediction(payload));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ home_team: homeTeam, away_team: awayTeam }));
  });
}
