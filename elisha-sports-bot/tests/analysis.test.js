import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMatch, summarizeForm } from '../src/services/analysisService.js';

test('summarizes match form without inventing missing values', () => {
  const summary = summarizeForm([
    { result: 'W', scored: 2, conceded: 0, wins: 2, draws: 1, losses: 0 },
    { result: 'D', scored: 1, conceded: 1, wins: 2, draws: 1, losses: 0 },
    { result: 'W', scored: 3, conceded: 1, wins: 2, draws: 1, losses: 0 }
  ]);
  assert.equal(summary.wins, 2);
  assert.equal(summary.draws, 1);
  assert.equal(summary.losses, 0);
  assert.equal(summary.goalsFor, 6);
  assert.equal(summary.goalsAgainst, 2);
});

test('does not invent a match forecast when all data is missing', async () => {
  const result = await analyzeMatch({ teamA: 'Arsenal', teamB: 'Chelsea', formA: [], formB: [], h2h: null });
  assert.match(result, /reliable form and head-to-head data are unavailable/i);
});

test('summarizes available data and includes uncertainty', async () => {
  const formA = [
    { result: 'W', scored: 2, conceded: 0, wins: 2, draws: 1, losses: 0 },
    { result: 'D', scored: 1, conceded: 1, wins: 2, draws: 1, losses: 0 },
    { result: 'W', scored: 3, conceded: 1, wins: 2, draws: 1, losses: 0 }
  ];
  const result = await analyzeMatch({
    teamA: 'Arsenal',
    teamB: 'Chelsea',
    formA,
    formB: [{ result: 'L', scored: 0, conceded: 1, wins: 0, draws: 0, losses: 1 }],
    h2h: { wins_a: 3, wins_b: 2, draws: 1, matches: 6 }
  });
  assert.match(result, /Arsenal recent form/i);
  assert.match(result, /head-to-head/i);
  assert.match(result, /do not guarantee/i);
});
