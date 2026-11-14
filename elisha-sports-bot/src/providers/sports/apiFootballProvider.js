import { env } from '../../config/env.js';
import { SportsDataProvider } from './sportsDataProvider.js';

const API_BASE = (env.SPORTS_API_BASE_URL || 'https://api.football-data.org/v4').replace(/\/$/, '');
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN', 'FINISHED']);
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

export class ApiFootballProvider extends SportsDataProvider {
  constructor({ fetchImpl = fetch } = {}) {
    super();
    this.fetchImpl = fetchImpl;
  }

  async request(path, params = {}, { allowObject = false } = {}) {
    const key = env.SPORTS_API_KEY || env.FOOTBALL_DATA_API_KEY;
    if (!key) throw new Error('FOOTBALL_DATA_API_KEY or SPORTS_API_KEY is not configured');

    const url = new URL(`${API_BASE}/${path.replace(/^\//, '')}`);
    for (const [keyName, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(keyName, String(value));
    }

    const response = await this.fetchImpl(url, {
      headers: {
        'X-Auth-Token': key,
        accept: 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Football Data API returned HTTP ${response.status}`);
    }

    const body = await response.json();
    if (body?.error) {
      const message = body.error?.message || body.error || 'unknown error';
      throw new Error(`Football Data API rejected the request: ${message}`);
    }

    if (Array.isArray(body.matches)) return body.matches;
    if (Array.isArray(body.standings)) return body.standings;
    if (Array.isArray(body.response)) return body.response;
    if (allowObject && body && typeof body === 'object') return body;
    return [];
  }

  async resolveLeagueId(leagueName) {
    const value = String(leagueName ?? '').trim();
    if (/^\d+$/.test(value)) return value;

    const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!normalized) return env.SPORTS_API_LEAGUE_ID || 'PL';

    const direct = LEAGUE_CODES.get(normalized) || LEAGUE_CODES.get(normalized.replace(/\s+/g, ' '));
    if (direct) return direct;

    const uppercase = normalized.toUpperCase();
    if (uppercase.length <= 8 && /^[A-Z0-9]+$/.test(uppercase)) return uppercase;

    return env.SPORTS_API_LEAGUE_ID || 'PL';
  }

  async getFixtures({ limit = 3, onlyResults = false, liveOnly = false, league } = {}) {
    const competition = await this.resolveLeagueId(league || 'Premier League');
    const today = kampalaDate(new Date());
    const endDate = kampalaDate(new Date(Date.now() + 14 * 86400000));

    const params = {
      dateFrom: today,
      dateTo: endDate
    };

    if (liveOnly) {
      params.status = 'LIVE';
    } else if (onlyResults) {
      params.status = 'FINISHED';
    } else {
      params.status = 'SCHEDULED';
    }

    const rows = await this.request(`competitions/${competition}/matches`, params);
    const selectedRows = liveOnly
      ? rows
      : onlyResults
        ? rows.filter((row) => row.status === 'FINISHED' || FINISHED_STATUSES.has(row.status))
        : rows.filter((row) => {
            const isFuture = row.utcDate ? new Date(row.utcDate).getTime() >= Date.now() : false;
            const isScheduled = ['SCHEDULED', 'TIMED', 'LIVE'].includes(row.status ?? '');
            return isFuture && isScheduled;
          });

    return selectedRows.slice(0, limit).map((row) => ({
      id: row.id,
      home: row.homeTeam?.name ?? 'Home team',
      away: row.awayTeam?.name ?? 'Away team',
      time: row.utcDate,
      score: row.score?.fullTime?.home != null && row.score?.fullTime?.away != null
        ? `${row.score.fullTime.home}-${row.score.fullTime.away}`
        : null,
      status: row.status ?? 'Scheduled',
      elapsed: row.minutes ?? null,
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
    const rows = await this.request(`competitions/${competition}/standings`, {});
    const standings = Array.isArray(rows) ? rows : (rows?.standings ?? []);
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
    const rows = await this.request(`competitions/${competition}/matches`, {
      season: year,
      dateFrom: `${year}-01-01`,
      dateTo: `${year}-12-31`
    });

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
