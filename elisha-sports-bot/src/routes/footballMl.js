import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';

router.post('/predict', (req, res) => {
  const { home_team: home, away_team: away, kickoff } = req.body ?? {};
  if (typeof home !== 'string' || !home.trim() || home.trim().length > 80 ||
      typeof away !== 'string' || !away.trim() || away.trim().length > 80 ||
      home.trim().toLowerCase() === away.trim().toLowerCase() ||
      (kickoff !== undefined && kickoff !== null && (typeof kickoff !== 'string' || Number.isNaN(Date.parse(kickoff))))) {
    return res.status(400).json({
      ok: false,
      error: 'Provide different non-empty home_team and away_team names (max 80 characters) and an optional ISO kickoff date.'
    });
  }

  const child = spawn(pythonBin, ['predict.py', '--request-stdin'], {
    cwd: analyticsDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });
  let stdout = '';
  let stderr = '';
  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      finished = true;
      child.kill('SIGKILL');
      res.status(504).json({ ok: false, error: 'Football prediction timed out.' });
    }
  }, 15000);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 1_000_000) child.kill('SIGKILL'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.slice(0, 4000); });
  child.on('error', (error) => {
    if (finished) return;
    finished = true; clearTimeout(timeout);
    res.status(503).json({ ok: false, error: 'Python prediction runtime is unavailable.', detail: error.code === 'ENOENT' ? 'Install Python and configure PYTHON_BIN if needed.' : 'Could not start prediction process.' });
  });
  child.on('close', (code) => {
    if (finished) return;
    finished = true; clearTimeout(timeout);
    let payload;
    try { payload = JSON.parse(stdout); } catch {
      return res.status(503).json({ ok: false, error: 'Prediction output was invalid.', detail: stderr.slice(0, 500) });
    }
    if (code !== 0 || payload.error) {
      const message = payload.error || 'Prediction process failed.';
      const missingModel = /Models are not trained|No such file/i.test(message);
      return res.status(missingModel ? 503 : 422).json({ ok: false, error: message });
    }
    return res.json({ ok: true, prediction: payload });
  });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ home_team: home.trim(), away_team: away.trim(), kickoff: kickoff ?? null }));
});

export { router as footballMlRouter };
