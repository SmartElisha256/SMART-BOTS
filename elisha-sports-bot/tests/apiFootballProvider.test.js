import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiFootballProvider } from '../src/providers/sports/apiFootballProvider.js';

function providerWithResponse(payload, { status = 200, headers = {} } = {}) {
  const requests = [];
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const provider = new ApiFootballProvider({
    apiKey: 'test-token',
    apiBaseUrl: 'https://football-data.test/v4',
    maxRequestsPerMinute: 100,
    fetchImpl: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get(name) {
            return headerMap.get(String(name).toLowerCase()) ?? null;
          }
        },
        json: async () => payload
      };
    }
  });
  return { provider, requests };
}

test('football-data v4 sends the auth token and maps upcoming match fields', async () => {
  const { provider, requests } = providerWithResponse({
    matches: [{
      id: 42,
      utcDate: new Date(Date.now() + 86400000).toISOString(),
      status: 'TIMED',
      homeTeam: { name: 'Arsenal' },
      awayTeam: { name: 'Chelsea' },
      score: { fullTime: { home: null, away: null } }
    }]
  });

  const matches = await provider.getFixtures({ league: 'Premier League' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.pathname, '/v4/competitions/PL/matches');
  assert.equal(requests[0].options.headers['X-Auth-Token'], 'test-token');
  assert.equal(requests[0].url.searchParams.get('status'), 'SCHEDULED');
  assert.equal(matches[0].home, 'Arsenal');
  assert.equal(matches[0].away, 'Chelsea');
  assert.equal(matches[0].score, null);
});

test('results query uses a past date range and returns only finished matches', async () => {
  const { provider, requests } = providerWithResponse({ matches: [
    { id: 1, status: 'FINISHED', homeTeam: { name: 'A' }, awayTeam: { name: 'B' }, score: { fullTime: { home: 2, away: 1 } } },
    { id: 2, status: 'SCHEDULED', homeTeam: { name: 'C' }, awayTeam: { name: 'D' }, score: { fullTime: { home: null, away: null } } }
  ] });

  const matches = await provider.getFixtures({ onlyResults: true, limit: 10 });
  const query = requests[0].url.searchParams;
  assert.equal(query.get('status'), 'FINISHED');
  assert.ok(query.get('dateFrom') < query.get('dateTo'));
  assert.deepEqual(matches.map(({ id }) => id), [1]);
  assert.equal(matches[0].score, '2-1');
});

test('season query uses the provider season parameter without calendar-year bounds', async () => {
  const { provider, requests } = providerWithResponse({ matches: [] });
  await provider.getSeasonFixtures({ league: 'EPL', season: new Date().getFullYear() - 1 });
  assert.equal(requests[0].url.pathname, '/v4/competitions/PL/matches');
  assert.equal(requests[0].url.searchParams.get('season'), String(new Date().getFullYear() - 1));
  assert.equal(requests[0].url.searchParams.has('dateFrom'), false);
  assert.equal(requests[0].url.searchParams.has('dateTo'), false);
});

test('standings flatten football-data v4 standings response', async () => {
  const { provider } = providerWithResponse({ standings: [{ table: [{
    position: 1, team: { name: 'Arsenal' }, points: 80, playedGames: 32,
    won: 25, draw: 5, lost: 2, goalsFor: 70, goalsAgainst: 20
  }] }] });
  const table = await provider.getLeagueTable();
  assert.deepEqual(table[0], {
    position: 1, team: 'Arsenal', points: 80, played: 32,
    wins: 25, draws: 5, losses: 2, goalsFor: 70, goalsAgainst: 20,
    source: 'api-football'
  });
});

test('provider reports HTTP and API-level errors clearly', async () => {
  const httpFailure = providerWithResponse({}, { status: 500 }).provider;
  await assert.rejects(httpFailure.request('competitions/PL/matches'), /HTTP 500/);

  const apiFailure = providerWithResponse({ errorCode: 400, message: 'Invalid filter' }).provider;
  await assert.rejects(apiFailure.request('competitions/PL/matches'), /Invalid filter/);
});

test('HTTP 429 returns a friendly rate-limit message after one retry', async () => {
  let calls = 0;
  const provider = new ApiFootballProvider({
    apiKey: 'test-token',
    apiBaseUrl: 'https://football-data.test/v4',
    maxRequestsPerMinute: 100,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: false,
        status: 429,
        headers: {
          get(name) {
            if (String(name).toLowerCase() === 'retry-after') return '1';
            return null;
          }
        },
        json: async () => ({})
      };
    }
  });

  await assert.rejects(
    provider.request('competitions/PL/matches'),
    /temporarily rate-limited by the provider/i
  );
  assert.equal(calls, 2, 'should retry once on 429');
});

test('client-side rate guard blocks bursts above the per-minute budget', async () => {
  const provider = new ApiFootballProvider({
    apiKey: 'test-token',
    apiBaseUrl: 'https://football-data.test/v4',
    maxRequestsPerMinute: 2,
    rateWindowMs: 60_000,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ matches: [] })
    })
  });

  await provider.request('competitions/PL/matches');
  await provider.request('competitions/PL/matches');
  await assert.rejects(
    provider.request('competitions/PL/matches'),
    /temporarily rate-limited/i
  );
});

test('unsupported v4 team data is explicit instead of fabricated', async () => {
  const { provider } = providerWithResponse({ matches: [] });
  assert.equal((await provider.getTeamAvailability('Arsenal')).status, 'unsupported');
  assert.equal((await provider.getTeamStrength('Arsenal')).status, 'unsupported');
  assert.equal((await provider.getLineupContext('Arsenal', 'Chelsea')).status, 'unsupported');
  assert.deepEqual(await provider.getTeamFormStats('Arsenal'), []);
  assert.equal(await provider.getHeadToHeadRecord('Arsenal', 'Chelsea'), null);
});
