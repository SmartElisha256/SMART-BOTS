import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFootballIntent } from '../src/services/footballMlService.js';
import { parseCommand } from '../src/services/commandService.js';

test('concept questions route to AI-only without running the prediction model', () => {
  assert.equal(detectFootballIntent('What is xG?'), 'ai_only');
  assert.equal(detectFootballIntent('Explain the 4-3-3 formation'), 'ai_only');
  assert.equal(detectFootballIntent('What does offside mean?'), 'ai_only');
});

test('specific match forecast questions route to ML plus AI', () => {
  assert.equal(detectFootballIntent('Arsenal vs Chelsea, who might win?'), 'ml_ai');
  assert.equal(detectFootballIntent('Predict Barcelona against Real Madrid'), 'ml_ai');
});

test('match questions requiring recent or current evidence route to data plus ML plus AI', () => {
  assert.equal(detectFootballIntent('Arsenal vs Chelsea recent form'), 'data_ml_ai');
  assert.equal(detectFootballIntent('Compare current team stats for Barcelona vs Real Madrid'), 'data_ml_ai');
});

test('natural-language match data requests reach the match analysis handler', () => {
  assert.deepEqual(parseCommand('Arsenal vs Chelsea recent form'), {
    command: 'analyze',
    args: 'arsenal vs chelsea',
    raw: 'arsenal vs chelsea recent form'
  });
});

test('current data requests remain data requests rather than generic AI', () => {
  assert.equal(detectFootballIntent('What are the live scores right now?'), 'data_only');
});
