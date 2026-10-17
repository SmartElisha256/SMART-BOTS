import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/services/commandService.js';

test('parseCommand handles a command without arguments', () => {
  assert.deepEqual(parseCommand('MENU'), { command: 'menu', args: null, raw: 'menu' });
});

test('parseCommand separates command and multiword arguments', () => {
  assert.deepEqual(parseCommand('FORM Arsenal Women'), {
    command: 'form', args: 'arsenal women', raw: 'form arsenal women'
  });
});

test('parseCommand handles whitespace and H2H arguments', () => {
  assert.deepEqual(parseCommand('  '), { command: null, args: null, raw: '' });
  assert.deepEqual(parseCommand('H2H Manchester City vs Liverpool'), {
    command: 'h2h', args: 'manchester city vs liverpool', raw: 'h2h manchester city vs liverpool'
  });
});

import { formatFootballPrediction } from '../src/services/footballMlService.js';

test('football prediction formatter shows probabilities, explanation, and disclaimer', () => {
  const message = formatFootballPrediction({
    fixture: { home_team: 'Arsenal', away_team: 'Chelsea' },
    match_result: { home_win: 0.5, draw: 0.3, away_win: 0.2 },
    statistical_outlook: {
      most_likely_single_outcome: 'Arsenal win',
      model_probability: 0.5,
      reasons: ['The model assigns its highest single-outcome probability to Arsenal win (50.0%).']
    },
    expected_goals: { home: 1.6, away: 1.1 },
    data_quality: { status: 'unvalidated', historical_matches: 150, warnings: ['Model has not been independently validated.'] }
  });
  assert.match(message, /Arsenal win: 50.0%/);
  assert.match(message, /Draw: 30.0%/);
  assert.match(message, /Highest-probability outcome: Arsenal win/);
  assert.match(message, /Why the model leans this way/);
  assert.match(message, /not guarantees or betting recommendations/);
});
