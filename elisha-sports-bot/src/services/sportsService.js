import { z } from 'zod';
import { getSportsDataProvider } from '../providers/sports/providerFactory.js';
import { getCached, getStaleCached, setCached, generateCacheKey } from '../utils/cache.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const sportsOptionsSchema = z.object({
  limit: z.number().int().min(1).max(10).default(3),
  liveOnly: z.boolean().default(false),
  onlyResults: z.boolean().default(false),
  league: z.string().default('Premier League')
});

function markDegraded(payload, reason) {
  if (Array.isArray(payload)) {
    return payload.map((row, index) =>
      index === 0
        ? { ...row, degraded: true, degradeReason: reason }
        : row
    );
  }
  if (payload && typeof payload === 'object') {
    return { ...payload, degraded: true, degradeReason: reason };
  }
  return payload;
}

async function withCacheAndStale(cacheKey, ttlSeconds, fetchFn) {
  const cached = await getCached(cacheKey);
  if (cached) {
    logger.debug({ cacheKey }, 'Cache hit');
    return cached;
  }

  try {
    const fresh = await fetchFn();
    await setCached(cacheKey, fresh, ttlSeconds);
    return fresh;
  } catch (error) {
    const stale = await getStaleCached(cacheKey);
    if (stale) {
      logger.warn({ cacheKey, error: error.message }, 'Serving stale sports cache after provider error');
      return markDegraded(stale, error.message || 'provider_error');
    }
    throw error;
  }
}

export async function getUpcomingFixtures(options = {}) {
  const payload = sportsOptionsSchema.parse(options);
  const cacheKey = generateCacheKey(
    'fixtures',
    payload.league,
    String(payload.limit),
    String(payload.liveOnly),
    String(payload.onlyResults)
  );
  return withCacheAndStale(cacheKey, payload.liveOnly ? 60 : env.CACHE_TTL_FIXTURES, async () => {
    const provider = getSportsDataProvider();
    return provider.getFixtures({
      limit: payload.limit,
      onlyResults: payload.onlyResults,
      liveOnly: payload.liveOnly,
      league: payload.league
    });
  });
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
  return withCacheAndStale(cacheKey, env.CACHE_TTL_TABLE, async () => {
    const provider = getSportsDataProvider();
    const table = await provider.getLeagueTable({ league: payload.league });
    return (table ?? []).slice(0, payload.limit);
  });
}

export async function getTeamFormStats(teamName, options = {}) {
  const safeTeam = String(teamName || '').trim();
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 10);
  const cacheKey = generateCacheKey('form', safeTeam, String(limit));
  return withCacheAndStale(cacheKey, env.CACHE_TTL_FORM, async () => {
    const provider = getSportsDataProvider();
    return provider.getTeamFormStats(safeTeam, { ...options, limit });
  });
}

export async function getHeadToHeadRecord(teamA, teamB) {
  const a = String(teamA || '').trim();
  const b = String(teamB || '').trim();
  const cacheKey = generateCacheKey('h2h', a.toLowerCase(), b.toLowerCase());
  return withCacheAndStale(cacheKey, env.CACHE_TTL_FORM, async () => {
    const provider = getSportsDataProvider();
    return provider.getHeadToHeadRecord(a, b);
  });
}

export async function getHistoricalSeasonFixtures({ league = 'Premier League', season } = {}) {
  const year = Number(season);
  if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
    throw new Error('Season must be a valid year from 2000 through the current year');
  }
  const provider = getSportsDataProvider();
  if (typeof provider.getSeasonFixtures !== 'function') {
    throw new Error('The configured sports-data provider does not support historical season fixtures');
  }
  const cacheKey = generateCacheKey('historical-season', league.toLowerCase(), String(year));
  return withCacheAndStale(cacheKey, 86400, async () => provider.getSeasonFixtures({ league, season: year }));
}

export async function getSportsSummary() {
  return {
    fixtures: await getUpcomingFixtures({ limit: 3 }),
    table: await getLeagueTable({ limit: 5 }),
    source: env.SPORTS_DATA_PROVIDER,
    note: env.SPORTS_DATA_PROVIDER === 'mock'
      ? 'Mock data only. No real sports-data provider is configured.'
      : 'Data supplied by the configured football provider (prefer football-data.org free tier + cache).'
  };
}
