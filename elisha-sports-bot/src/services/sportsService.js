import { z } from 'zod';
import { getSportsDataProvider } from '../providers/sports/providerFactory.js';
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
  const cacheKey = generateCacheKey('fixtures', payload.league, String(payload.limit), String(payload.liveOnly), String(payload.onlyResults));
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for fixtures');
    return cached;
  }
  const provider = getSportsDataProvider();
  const fixtures = await provider.getFixtures({
    limit: payload.limit, onlyResults: payload.onlyResults, liveOnly: payload.liveOnly, league: payload.league
  });
  await setCached(cacheKey, fixtures, payload.liveOnly ? 60 : env.CACHE_TTL_FIXTURES);
  return fixtures;
}

export async function getLiveScores(options = {}) {
  return getUpcomingFixtures({
    limit: options.limit ?? 5,
    liveOnly: true,
    onlyResults: false,
    league: options.league ?? 'Premier League'
  });
}

export async function getLeagueTable(options = {}) {
  const payload = sportsOptionsSchema.parse({
    limit: options.limit ?? 5,
    liveOnly: false,
    onlyResults: false,
    league: options.league ?? 'Premier League'
  });
  const cacheKey = generateCacheKey('table', payload.league, String(payload.limit));
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for table');
    return cached;
  }
  const provider = getSportsDataProvider();
  const table = await provider.getLeagueTable({ league: payload.league });
  const limitedTable = (table ?? []).slice(0, payload.limit);
  await setCached(cacheKey, limitedTable, env.CACHE_TTL_TABLE);
  return limitedTable;
}

export async function getTeamFormStats(teamName, options = {}) {
  const safeTeam = String(teamName || '').trim();
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 10);
  const cacheKey = generateCacheKey('form', safeTeam, String(limit));
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for form');
    return cached;
  }
  const provider = getSportsDataProvider();
  const form = await provider.getTeamFormStats(safeTeam, { ...options, limit });
  await setCached(cacheKey, form, env.CACHE_TTL_FORM);
  return form;
}

export async function getHeadToHeadRecord(teamA, teamB) {
  const a = String(teamA || '').trim();
  const b = String(teamB || '').trim();
  const cacheKey = generateCacheKey('h2h', a.toLowerCase(), b.toLowerCase());
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit for H2H');
    return cached;
  }
  const provider = getSportsDataProvider();
  const record = await provider.getHeadToHeadRecord(a, b);
  if (record) await setCached(cacheKey, record, env.CACHE_TTL_FORM);
  return record;
}

export async function getSportsSummary() {
  return {
    fixtures: await getUpcomingFixtures({ limit: 3 }),
    table: await getLeagueTable({ limit: 5 }),
    source: env.SPORTS_DATA_PROVIDER,
    note: env.SPORTS_DATA_PROVIDER === 'mock'
      ? 'Mock data only. No real sports-data provider is configured.'
      : 'Data supplied by the configured football provider.'
  };
}
