import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSeasonFixtures, formatSeasonReport } from '../src/services/historicalSeasonService.js';

const fixtures = [
  { home: 'Alpha FC', away: 'Beta FC', homeGoals: 2, awayGoals: 0, status: 'FT' },
  { home: 'Beta FC', away: 'Alpha FC', homeGoals: 1, awayGoals: 1, status: 'FT' },
  { home: 'Gamma FC', away: 'Alpha FC', homeGoals: 0, awayGoals: 3, status: 'FT' },
  { home: 'Beta FC', away: 'Gamma FC', homeGoals: 2, awayGoals: 1, status: 'FT' },
  { home: 'Alpha FC', away: 'Gamma FC', homeGoals: null, awayGoals: null, status: 'NS' }
];

test('summarizes completed fixtures and excludes scheduled fixtures', () => {
  const result = summarizeSeasonFixtures(fixtures);
  assert.equal(result.matches, 4); assert.equal(result.teams, 3); assert.equal(result.totalGoals, 10); assert.equal(result.averageGoalsPerMatch, 2.5);
  assert.equal(result.table[0].team, 'Alpha FC'); assert.equal(result.table[0].points, 7); assert.equal(result.table[0].home.played, 1); assert.equal(result.table[0].away.played, 2);
});

test('returns a clear message when historical results are missing', () => {
  assert.match(formatSeasonReport({ league: 'Test League', season: 2022, fixtures: [] }), /No completed historical match data/);
});

test('formats league, season, and descriptive home/away stats', () => {
  const report = formatSeasonReport({ league: 'Test League', season: 2022, fixtures });
  assert.match(report, /Test League — 2022/); assert.match(report, /Home:/); assert.match(report, /Away:/); assert.match(report, /does not predict future match results/);
});
