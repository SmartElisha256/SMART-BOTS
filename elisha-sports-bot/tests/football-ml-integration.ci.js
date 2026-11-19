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

  // Status depends on how recent the trained CSV history is relative to kickoff.
  // Fresh history → ok/limited; history older than ~90 days relative to cutoff → stale.
  const dqStatus = prediction.data_quality?.status;
  assert.ok(
    ['ok', 'limited', 'stale', 'synthetic', 'unvalidated'].includes(dqStatus),
    `unexpected data_quality.status: ${dqStatus}`
  );
  assert.ok(Array.isArray(prediction.data_quality?.warnings));
  if (dqStatus === 'stale') {
    assert.ok(prediction.data_quality.warnings.some((warning) => /stale/i.test(warning)));
  }

  const message = formatMlPrediction(prediction);
  assert.match(message, /Arsenal vs Chelsea/);
  assert.match(message, /Match outcome/);
  assert.match(message, /Classifier 1X2/);
  assert.match(message, /not betting advice/i);
  if (dqStatus === 'stale') {
    assert.match(message, /stale/i);
  }
});
