import { z } from 'zod';
import { mockSportsProvider } from '../providers/sports/mockSportsProvider.js';
import { getCached, setCached, generateCacheKey } from '../utils/cache.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const sportsOptionsSchema = z.object({
  limit: z.number().int().min(1).max(10).default(3),
  liveOnly: z.boolean().default(false),
  onlyResults: z.boolean().default(false),
  league: z.string().default('Premier League')
});

export async function getUpcomingFixtures(options = {}) {
  const payload = sportsOptionsSchema.parse(options);
  const cacheKey = generateCacheKey('fixtures', payload.league, String(payload.limit), String(payload.liveOnly));

  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for fixtures');
    return cached;
  }

  const provider = mockSportsProvider;
  const fixtures = await provider.getFixtures({ limit: payload.limit, onlyResults: payload.onlyResults, liveOnly: payload.liveOnly });

  await setCached(cacheKey, fixtures, env.CACHE_TTL_FIXTURES);
  return fixtures;
}

export async function getLiveScores(options = {}) {
  const payload = sportsOptionsSchema.parse({ limit: options.limit ?? 5, liveOnly: true, onlyResults: false, league: options.league ?? 'Premier League' });
  const cacheKey = generateCacheKey('live-scores', payload.league);

  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for live scores');
    return cached;
  }

  const provider = mockSportsProvider;
  const scores = await provider.getFixtures({ limit: payload.limit, liveOnly: true });

  await setCached(cacheKey, scores, 60);
  return scores;
}

export async function getLeagueTable(options = {}) {
  const payload = sportsOptionsSchema.parse({
    limit: options.limit ?? 5,
    liveOnly: false,
    onlyResults: false,
    league: options.league ?? 'Premier League'
  });

  const cacheKey = generateCacheKey('table', payload.league);

  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for league table');
    return cached;
  }

  const provider = mockSportsProvider;
  const table = await provider.getLeagueTable();

  await setCached(cacheKey, table, env.CACHE_TTL_TABLE);
  return table;
}

export async function getTeamFormStats(teamName, options = {}) {
  const safeTeam = String(teamName || '').trim();
  const cacheKey = generateCacheKey('form', safeTeam);

  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for team form');
    return cached;
  }

  const provider = mockSportsProvider;
  const form = await provider.getTeamFormStats(safeTeam, options);

  await setCached(cacheKey, form, env.CACHE_TTL_FORM);
  return form;
}

export async function getHeadToHeadRecord(teamA, teamB) {
  const a = String(teamA || '').trim();
  const b = String(teamB || '').trim();
  const cacheKey = generateCacheKey('h2h', a, b);

  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for H2H');
    return cached;
  }

  const provider = mockSportsProvider;
  const record = await provider.getHeadToHeadRecord(a, b);

  if (record) {
    await setCached(cacheKey, record, env.CACHE_TTL_FORM);
  }

  return record;
}

export async function getSportsSummary() {
  return {
    fixtures: await getUpcomingFixtures({ limit: 3 }),
    table: await getLeagueTable({ limit: 5 }),
    source: 'mock',
    note: 'Mock data only. No real sports-data provider is configured.'
  };
}
