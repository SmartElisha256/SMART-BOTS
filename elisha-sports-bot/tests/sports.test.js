import test from 'node:test';
import assert from 'node:assert/strict';
import { getUpcomingFixtures, getLeagueTable } from '../src/services/sportsService.js';

test('returns upcoming fixtures', async () => {
  const fixtures = await getUpcomingFixtures({ limit: 2 });
  assert.equal(Array.isArray(fixtures), true);
  assert.ok(fixtures.length >= 1);
  assert.ok(fixtures[0].home);
  assert.ok(fixtures[0].away);
});

test('returns ranked standings table', async () => {
  const table = await getLeagueTable();
  assert.equal(Array.isArray(table), true);
  assert.ok(table.length >= 1);
  assert.ok(table[0].team);
  assert.ok(typeof table[0].points === 'number');
});
