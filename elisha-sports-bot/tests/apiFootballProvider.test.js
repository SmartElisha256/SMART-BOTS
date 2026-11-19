import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiFootballProvider } from '../src/providers/sports/apiFootballProvider.js';

function providerWithResponse(payload, { status = 200, headers = {} } = {}) {
  const requests = [];
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const provider = new ApiFootballProvider({
    apiKey: 'test-token',
    apiBaseUrl: 'https://football-data.test/v4',
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
  assert.equal(matches.length, 1);
  assert.equal(matches[0].home, 'Arsenal');
  assert.equal(matches[0].away, 'Chelsea');
  assert.equal(matches[0].source, 'football-data.org');
  assert.equal(requests[0].options.headers['X-Auth-Token'], 'test-token');
  assert.equal(requests[0].url.pathname, '/v4/competitions/PL/matches');
});

test('resolveLeagueId maps common aliases to football-data competition codes', async () => {
  const { provider } = providerWithResponse({ matches: [] });
  assert.equal(await provider.resolveLeagueId('La Liga'), 'PD');
  assert.equal(await provider.resolveLeagueId('serie a'), 'SA');
  assert.equal(await provider.resolveLeagueId('BL1'), 'BL1');
});

test('season fixtures use the season query without date bounds', async () => {
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
    source: 'football-data.org'
  });
});

test('provider reports HTTP and API-level errors clearly', async () => {
  const httpFailure = providerWithResponse({}, { status: 500 }).provider;
  await assert.rejects(httpFailure.request('competitions/PL/matches'), /HTTP 500/);

  const rateLimited = providerWithResponse({}, { status: 429 }).provider;
  await assert.rejects(rateLimited.request('competitions/PL/matches'), /rate limit/i);

  const apiFailure = providerWithResponse({ errorCode: 400, message: 'Invalid filter' }).provider;
  await assert.rejects(apiFailure.request('competitions/PL/matches'), /Invalid filter/);
});

test('auth failures surface a clear FOOTBALL_DATA_API_KEY message', async () => {
  const denied = providerWithResponse({}, { status: 403 }).provider;
  await assert.rejects(denied.request('competitions/PL/matches'), /FOOTBALL_DATA_API_KEY/i);
});

test('unsupported v4 team data is explicit instead of fabricated', async () => {
  const { provider } = providerWithResponse({ matches: [] });
  assert.equal((await provider.getTeamAvailability('Arsenal')).status, 'unsupported');
  assert.equal((await provider.getTeamStrength('Arsenal')).status, 'unsupported');
  assert.equal((await provider.getLineupContext('Arsenal', 'Chelsea')).status, 'unsupported');
  assert.deepEqual(await provider.getTeamFormStats('Arsenal'), []);
  assert.equal(await provider.getHeadToHeadRecord('Arsenal', 'Chelsea'), null);
});
