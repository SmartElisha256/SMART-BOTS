import test from 'node:test';
import assert from 'node:assert/strict';
import { detectFootballIntent, formatMlPrediction } from '../src/services/footballMlService.js';

test('football intent routes concepts and rules to AI alone', () => {
  assert.equal(detectFootballIntent('Explain the offside rule'), 'ai_only');
  assert.equal(detectFootballIntent('What is xG in football?'), 'ml_ai');
  assert.equal(detectFootballIntent('Explain how a 4-3-3 formation works'), 'ai_only');
});

test('football intent routes match predictions and markets to ML plus AI', () => {
  assert.equal(detectFootballIntent('Arsenal vs Chelsea, who might win?'), 'ml_ai');
  assert.equal(detectFootballIntent('Give me BTTS and over 2.5 probabilities'), 'ml_ai');
  assert.equal(detectFootballIntent('What are today\'s tips?'), 'ml_ai');
});

test('ML prediction formatter safely renders supported output', () => {
  const text = formatMlPrediction({
    fixture: { home_team: 'Arsenal', away_team: 'Chelsea' },
    match_result: { home_win: 0.5, draw: 0.25, away_win: 0.25 },
    machine_learning_result: { home_win: 0.45, draw: 0.3, away_win: 0.25 },
    double_chance: { '1X': 0.75, X2: 0.5, '12': 0.75 },
    goal_markets: { over_1_5: 0.8, over_2_5: 0.55, under_2_5: 0.45 },
    btts: { yes: 0.6, no: 0.4 },
    expected_goals: { home: 1.7, away: 1.1 },
    correct_score: [{ score: '1-1', probability: 0.12 }],
    confidence: { level: 'limited' },
    data_quality: { historical_matches: 500, warnings: [] }
  });
  assert.match(text, /Arsenal vs Chelsea/);
  assert.match(text, /Home 50.0%/);
  assert.match(text, /BTTS: Yes 60.0%/);
  assert.match(text, /not guarantees/);
});
