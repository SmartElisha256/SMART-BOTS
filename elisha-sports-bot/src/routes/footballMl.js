import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();
const here = path.dirname(fileURLToPath(import.meta.url));
const analyticsDir = path.resolve(here, '../../football-analytics');
const pythonBin = process.env.PYTHON_BIN || 'python3';

function authorizePredictionRequest(req, res) {
  // This route can trigger CPU-intensive Python work. In production, require
  // a dedicated secret so the endpoint cannot be used as an unauthenticated
  // public prediction service. Internal app calls should send x-api-key.
  if (process.env.NODE_ENV !== 'production') return true;

  const expected = process.env.FOOTBALL_ML_API_KEY?.trim();
  if (!expected) {
    res.status(503).json({
      ok: false,
      error: 'Football ML API is disabled until FOOTBALL_ML_API_KEY is configured.'
    });
    return false;
  }

  const authorization = req.get('authorization') || '';
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const supplied = req.get('x-api-key') || bearer;
  if (!supplied || supplied !== expected) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return false;
  }
  return true;
}

router.post('/predict', (req, res) => {
  if (!authorizePredictionRequest(req, res)) return;

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
  child.stdout.on('data', (chunk) => {
    if (finished) return;
    stdout += chunk;
    if (stdout.length > 1_000_000) {
      finished = true;
      clearTimeout(timeout);
      child.kill('SIGKILL');
      res.status(502).json({ ok: false, error: 'Prediction output exceeded the allowed size.' });
    }
  });
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
