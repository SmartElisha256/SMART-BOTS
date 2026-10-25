import test from 'node:test';
import assert from 'node:assert/strict';
import { predictFootballMatch, formatMlPrediction } from '../src/services/footballMlService.js';

test('Node service invokes the real Python model and formats a safe prediction response', async () => {
  const prediction = await predictFootballMatch({
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    kickoff: '2026-11-10T15:00:00Z'
  });

  assert.equal(prediction.prediction_available, true);
  assert.ok(prediction.match_result);
  assert.ok(prediction.machine_learning_result);
  assert.ok(prediction.expected_goals);
  assert.ok(prediction.markets_meta?.poisson_grid);
  assert.equal(prediction.data_quality.status, 'stale');
  assert.ok(prediction.data_quality.warnings.some(warning => /stale/i.test(warning)));

  const message = formatMlPrediction(prediction);
  assert.match(message, /Arsenal vs Chelsea/);
  assert.match(message, /Match outcome/);
  assert.match(message, /Classifier 1X2/);
  assert.match(message, /stale/i);
  assert.match(message, /not betting advice/i);
});
