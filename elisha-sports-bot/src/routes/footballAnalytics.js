import { Router } from 'express';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const footballAnalyticsRoot = path.join(projectRoot, 'football-analytics');
const pythonBinary = process.env.PYTHON_BIN || 'python3';
const defaultDataPath = path.join(footballAnalyticsRoot, 'data', 'synthetic_matches.csv');
const defaultModelDir = path.join(footballAnalyticsRoot, 'models');

function runPrediction(fixture) {
  return new Promise((resolve, reject) => {
    const args = [
      path.join(footballAnalyticsRoot, 'predict.py'),
      '--home-team', String(fixture.home_team ?? '').trim(),
      '--away-team', String(fixture.away_team ?? '').trim(),
      '--competition', String(fixture.competition ?? 'Premier League').trim(),
      '--data-path', defaultDataPath,
      '--model-dir', defaultModelDir,
    ];

    if (fixture.kickoff) {
      args.push('--kickoff', String(fixture.kickoff));
    }

    const child = spawn(pythonBinary, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += String(data);
    });

    child.stderr.on('data', (data) => {
      stderr += String(data);
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Prediction process exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Prediction service returned invalid JSON: ${error.message}`));
      }
    });
  });
}

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'football-ml',
    python: pythonBinary,
    dataset: defaultDataPath,
    modelDir: defaultModelDir,
  });
});

router.post('/predict', async (req, res) => {
  try {
    const fixture = req.body?.fixture ?? req.body ?? {};
    if (!fixture.home_team || !fixture.away_team) {
      return res.status(400).json({ ok: false, message: 'fixture.home_team and fixture.away_team are required.' });
    }

    const prediction = await runPrediction(fixture);
    return res.json(prediction);
  } catch (error) {
    return res.status(503).json({
      ok: false,
      message: 'Football ML prediction service is unavailable.',
      error: error.message,
    });
  }
});

export { router as footballAnalyticsRouter };
export default router;
