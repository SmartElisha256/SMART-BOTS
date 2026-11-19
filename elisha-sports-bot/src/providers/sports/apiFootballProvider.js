import { env } from '../../config/env.js';
import { SportsDataProvider } from './sportsDataProvider.js';

const API_BASE = (env.SPORTS_API_BASE_URL || 'https://api.football-data.org/v4').replace(/\/$/, '');
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'FINISHED']);

// Free plan is 10 req/min; stay slightly under to reduce 429s under concurrent load.
const DEFAULT_MAX_REQUESTS_PER_MINUTE = 8;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_RETRY_AFTER_MS = 6_000;

const LEAGUE_CODES = new Map([
  ['premier league', 'PL'],
  ['english premier league', 'PL'],
  ['epl', 'PL'],
  ['la liga', 'PD'],
  ['laliga', 'PD'],
  ['serie a', 'SA'],
  ['seriea', 'SA'],
  ['bundesliga', 'BL1'],
  ['ligue 1', 'FL1'],
  ['ligue1', 'FL1'],
  ['uefa champions league', 'CL'],
  ['champions league', 'CL'],
  ['ucl', 'CL'],
  ['europa league', 'EL'],
  ['uefa europa league', 'EL'],
  ['uefa europa conference league', 'EC'],
  ['conference league', 'EC'],
  ['major league soccer', 'MLS'],
  ['mls', 'MLS'],
  ['saudi pro league', 'SA'],
  ['saudi', 'SA'],
  ['uganda premier league', 'UPL'],
  ['upl', 'UPL']
]);

function kampalaDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Kampala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date, days) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return kampalaDate(shifted);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ApiFootballProvider extends SportsDataProvider {
  constructor({
    fetchImpl = fetch,
    apiKey = env.SPORTS_API_KEY || env.FOOTBALL_DATA_API_KEY,
    apiBaseUrl = API_BASE,
    maxRequestsPerMinute = DEFAULT_MAX_REQUESTS_PER_MINUTE,
    rateWindowMs = DEFAULT_RATE_WINDOW_MS
  } = {}) {
    super();
    this.fetchImpl = fetchImpl;
    this.apiKey = apiKey;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.maxRequestsPerMinute = Math.max(1, Number(maxRequestsPerMinute) || DEFAULT_MAX_REQUESTS_PER_MINUTE);
    this.rateWindowMs = Math.max(1000, Number(rateWindowMs) || DEFAULT_RATE_WINDOW_MS);
    this._requestTimestamps = [];
  }

  /**
   * Sliding-window throttle: keep at most maxRequestsPerMinute inside the window.
   * Throws a clear error instead of silently delaying (WhatsApp UX prefers fast feedback).
   */
  async _acquireRateSlot() {
    const now = Date.now();
    this._requestTimestamps = this._requestTimestamps.filter((ts) => now - ts < this.rateWindowMs);

    if (this._requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldest = this._requestTimestamps[0];
      const waitMs = this.rateWindowMs - (now - oldest);
      const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
      throw new Error(
        `Sports data is temporarily rate-limited. Please try again in about ${waitSec} second${waitSec === 1 ? '' : 's'}.`
      );
    }

    this._requestTimestamps.push(now);
  }

  async request(path, params = {}, { allowObject = false, _retried = false } = {}) {
    if (!this.apiKey) throw new Error('FOOTBALL_DATA_API_KEY or SPORTS_API_KEY is not configured');

    await this._acquireRateSlot();

    const url = new URL(`${this.apiBaseUrl}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const response = await this.fetchImpl(url, {
      headers: { 'X-Auth-Token': this.apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });

    // Respect provider-reported remaining quota when present (best-effort).
    const available = response.headers?.get?.('X-RequestsAvailable');
    const resetSec = response.headers?.get?.('X-RequestCounter-Reset');

    if (response.status === 429) {
      const retryAfterHeader = response.headers?.get?.('Retry-After');
      const retryAfterMs = retryAfterHeader
        ? Math.min(30_000, Math.max(1000, Number(retryAfterHeader) * 1000 || DEFAULT_RETRY_AFTER_MS))
        : (resetSec ? Math.min(30_000, Math.max(1000, Number(resetSec) * 1000 || DEFAULT_RETRY_AFTER_MS)) : DEFAULT_RETRY_AFTER_MS);

      if (!_retried) {
        await sleep(retryAfterMs);
        return this.request(path, params, { allowObject, _retried: true });
      }

      const waitSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
      throw new Error(
        `Sports data is temporarily rate-limited by the provider. Please try again in about ${waitSec} second${waitSec === 1 ? '' : 's'}.`
      );
    }

    if (!response.ok) {
      throw new Error(`Football Data API returned HTTP ${response.status}`);
    }

    const body = await response.json();
    if (body?.error || body?.errorCode) {
      const message = body.message || body.error?.message || body.error || 'unknown error';
      // Some plans return rate-limit details in the body with a non-429 status.
      if (String(message).toLowerCase().includes('rate') || body.errorCode === 429) {
        throw new Error(
          'Sports data is temporarily rate-limited by the provider. Please try again in about a minute.'
        );
      }
      throw new Error(`Football Data API rejected the request: ${message}`);
    }

    // Attach soft quota hints for optional upstream logging (non-enumerable).
    if (available != null || resetSec != null) {
      // no-op storage; callers can extend later if needed
    }

    if (Array.isArray(body.matches)) return body.matches;
    if (Array.isArray(body.standings)) return body.standings;
    if (Array.isArray(body.response)) return body.response;
    if (allowObject && body && typeof body === 'object') return body;
    return [];
  }

  async resolveLeagueId(leagueName) {
    const value = String(leagueName ?? '').trim();
    const normalized = value.toLowerCase().replace(/\s+/g, ' ');
    if (!normalized) return env.SPORTS_API_LEAGUE_ID || 'PL';

    // API-Football numeric league IDs are not valid competition codes in v4.
    if (/^\d+$/.test(value)) return env.SPORTS_API_LEAGUE_ID || 'PL';

    const direct = LEAGUE_CODES.get(normalized);
    if (direct) return direct;

    const code = value.toUpperCase();
    if (code.length <= 8 && /^[A-Z0-9]+$/.test(code)) return code;

    return env.SPORTS_API_LEAGUE_ID || 'PL';
  }

  async getFixtures({ limit = 3, onlyResults = false, liveOnly = false, league } = {}) {
    const competition = await this.resolveLeagueId(league || 'Premier League');
    const today = kampalaDate(new Date());
    const params = {
      dateFrom: onlyResults ? shiftDate(new Date(), -30) : today,
      dateTo: liveOnly || onlyResults ? today : shiftDate(new Date(), 14)
    };

    if (liveOnly) params.status = 'LIVE';
    else if (onlyResults) params.status = 'FINISHED';
    else params.status = 'SCHEDULED';

    const rows = await this.request(`competitions/${competition}/matches`, params);
    const selectedRows = liveOnly
      ? rows.filter((row) => ['IN_PLAY', 'PAUSED', 'LIVE'].includes(row.status ?? ''))
      : onlyResults
        ? rows.filter((row) => FINISHED_STATUSES.has(row.status))
        : rows.filter((row) => {
            const kickoff = new Date(row.utcDate).getTime();
            return Number.isFinite(kickoff) && kickoff >= Date.now() &&
              ['SCHEDULED', 'TIMED'].includes(row.status ?? '');
          });

    const safeLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.min(100, Math.trunc(Number(limit)))) : 3;
    return selectedRows.slice(0, safeLimit).map((row) => ({
      id: row.id,
      home: row.homeTeam?.name ?? 'Home team',
      away: row.awayTeam?.name ?? 'Away team',
      time: row.utcDate,
      score: row.score?.fullTime?.home != null && row.score?.fullTime?.away != null
        ? `${row.score.fullTime.home}-${row.score.fullTime.away}`
        : null,
      status: row.status ?? 'Scheduled',
      elapsed: row.minute ?? null,
      source: 'api-football'
    }));
  }

  async findTeam() {
    return null;
  }

  async getTeamFormStats() {
    return [];
  }

  async getHeadToHeadRecord() {
    return null;
  }

  async getLeagueTable({ league } = {}) {
    const competition = await this.resolveLeagueId(league || 'Premier League');
    const response = await this.request(`competitions/${competition}/standings`, {}, { allowObject: true });
    const standings = Array.isArray(response) ? response : (response?.standings ?? []);
    const table = standings.flatMap((entry) => Array.isArray(entry.table) ? entry.table : []);

    return table.map((row) => ({
      position: row.position,
      team: row.team?.name ?? 'Unknown team',
      points: row.points ?? 0,
      played: row.playedGames ?? 0,
      wins: row.won ?? 0,
      draws: row.draw ?? 0,
      losses: row.lost ?? 0,
      goalsFor: row.goalsFor ?? 0,
      goalsAgainst: row.goalsAgainst ?? 0,
      source: 'api-football'
    }));
  }

  async getSeasonFixtures({ league = 'Premier League', season } = {}) {
    const year = Number(season);
    if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
      throw new Error('Season must be a year from 2000 through the current year');
    }

    const competition = await this.resolveLeagueId(league);
    // The v4 season parameter is the season's starting year. Date bounds based
    // on calendar years would incorrectly omit the second half of a season.
    const rows = await this.request(`competitions/${competition}/matches`, { season: year });
    return rows.map((row) => ({
      id: row.id,
      home: row.homeTeam?.name ?? '',
      away: row.awayTeam?.name ?? '',
      homeGoals: row.score?.fullTime?.home ?? null,
      awayGoals: row.score?.fullTime?.away ?? null,
      status: row.status ?? '',
      date: row.utcDate,
      source: 'api-football'
    }));
  }

  async getTeamAvailability(teamName) {
    return {
      team: teamName,
      status: 'unsupported',
      injuries: [],
      source: 'api-football',
      note: 'This provider does not expose team injury or availability data via the v4 API.'
    };
  }

  async getTeamStrength() {
    return {
      status: 'unsupported',
      source: 'api-football',
      note: 'This provider does not expose team-strength statistics in the v4 API.'
    };
  }

  async getLineupContext() {
    return {
      status: 'unsupported',
      source: 'api-football',
      note: 'This provider does not expose lineup data in the v4 API.'
    };
  }

  async getTeamSummary(teamName) {
    return `${teamName}: team summary is not supported by the football-data.org v4 provider.`;
  }
}

export default ApiFootballProvider;
