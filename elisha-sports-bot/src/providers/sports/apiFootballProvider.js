import { env } from '../../config/env.js';
import { SportsDataProvider } from './sportsDataProvider.js';

const API_BASE = (env.SPORTS_API_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

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

  async request(path, params = {}) {
    if (!env.SPORTS_API_KEY) throw new Error('SPORTS_API_KEY is not configured');
    const url = new URL(`${API_BASE}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await this.fetchImpl(url, {
      headers: { 'x-apisports-key': env.SPORTS_API_KEY, accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Football data API returned HTTP ${response.status}`);
    const body = await response.json();
    if (body.errors && Object.keys(body.errors).length) {
      throw new Error('Football data API rejected the request; check API key, league, season, and plan limits');
    }
    return Array.isArray(body.response) ? body.response : [];
  }

  async resolveLeagueId(leagueName) {
    const value = String(leagueName ?? '').trim();
    if (/^\d+$/.test(value)) return value;
    if (!value || value.toLowerCase() === 'premier league') return env.SPORTS_API_LEAGUE_ID;
    const rows = await this.request('leagues', { search: value, season: env.SPORTS_API_SEASON });
    const normalized = value.toLowerCase();
    const exact = rows.find((row) => row.league?.name?.toLowerCase() === normalized);
    return String((exact ?? rows[0])?.league?.id ?? env.SPORTS_API_LEAGUE_ID);
  }

  async getFixtures({ limit = 3, onlyResults = false, liveOnly = false, league } = {}) {
    const params = { timezone: 'Africa/Kampala' };
    if (liveOnly) {
      params.live = 'all';
    } else if (onlyResults) {
      params.last = Math.min(Math.max(limit, 1), 10);
    } else {
      const today = kampalaDate(new Date());
      const endDate = kampalaDate(new Date(Date.now() + 14 * 86400000));
      params.from = today;
      params.to = endDate;
      params.league = await this.resolveLeagueId(league);
      params.season = env.SPORTS_API_SEASON;
    }

    // Apply named as well as numeric league filters consistently for live scores/results.
    if (league && !/^\d+$/.test(String(league))) {
      params.league = await this.resolveLeagueId(league);
    } else if (league) {
      params.league = String(league);
    }

    const rows = await this.request('fixtures', params);
    const selectedRows = liveOnly
      ? rows
      : onlyResults
        ? rows.filter((row) => FINISHED_STATUSES.has(row.fixture?.status?.short))
        : rows.filter((row) =>
            new Date(row.fixture?.date).getTime() >= Date.now() &&
            ['NS', 'TBD', 'PST'].includes(row.fixture?.status?.short)
          );

    return selectedRows.slice(0, limit).map((row) => ({
      id: row.fixture?.id,
      home: row.teams?.home?.name ?? 'Home team',
      away: row.teams?.away?.name ?? 'Away team',
      time: row.fixture?.date,
      score: row.goals?.home != null && row.goals?.away != null ? `${row.goals.home}-${row.goals.away}` : null,
      status: row.fixture?.status?.long ?? row.fixture?.status?.short ?? 'Scheduled',
      elapsed: row.fixture?.status?.elapsed ?? null,
      source: 'api-football'
    }));
  }

  async findTeam(teamName) {
    const name = String(teamName || '').trim();
    if (!name) return null;
    const rows = await this.request('teams', { search: name });
    const normalized = name.toLowerCase();
    const exact = rows.find((row) => row.team?.name?.toLowerCase() === normalized);
    const selected = exact ?? rows[0];
    return selected?.team ? { id: selected.team.id, name: selected.team.name, country: selected.team.country } : null;
  }

  async getTeamFormStats(teamName, { limit = 5 } = {}) {
    const team = await this.findTeam(teamName);
    if (!team) return [];
    const rows = await this.request('fixtures', { team: team.id, last: Math.min(Math.max(limit, 1), 10), timezone: 'Africa/Kampala' });
    const finished = rows.filter((row) => FINISHED_STATUSES.has(row.fixture?.status?.short));
    const results = finished.map((row) => {
      const isHome = row.teams?.home?.id === team.id;
      const scored = isHome ? row.goals?.home : row.goals?.away;
      const conceded = isHome ? row.goals?.away : row.goals?.home;
      return { result: scored > conceded ? 'W' : scored < conceded ? 'L' : 'D', scored, conceded, opponent: isHome ? row.teams?.away?.name : row.teams?.home?.name, date: row.fixture?.date };
    });
    const wins = results.filter((row) => row.result === 'W').length;
    const draws = results.filter((row) => row.result === 'D').length;
    const losses = results.filter((row) => row.result === 'L').length;
    return results.map((row) => ({ ...row, wins, draws, losses, team: team.name, source: 'api-football' }));
  }

  async getHeadToHeadRecord(teamA, teamB) {
    const [a, b] = await Promise.all([this.findTeam(teamA), this.findTeam(teamB)]);
    if (!a || !b) return null;
    const rows = await this.request('fixtures/headtohead', { h2h: `${a.id}-${b.id}`, last: 10, timezone: 'Africa/Kampala' });
    const finished = rows.filter((row) => FINISHED_STATUSES.has(row.fixture?.status?.short));
    let wins_a = 0, wins_b = 0, draws = 0;
    for (const row of finished) {
      const homeId = row.teams?.home?.id;
      const homeGoals = row.goals?.home;
      const awayGoals = row.goals?.away;
      if (homeGoals === awayGoals) draws++;
      else {
        const winnerId = homeGoals > awayGoals ? homeId : row.teams?.away?.id;
        if (winnerId === a.id) wins_a++;
        else if (winnerId === b.id) wins_b++;
      }
    }
    const last = finished[0];
    return {
      team_a: a.name, team_b: b.name, wins_a, wins_b, draws,
      matches: finished.length,
      last_match_date: last?.fixture?.date ?? 'Unavailable',
      source: 'api-football'
    };
  }

  async getLeagueTable({ league } = {}) {
    const leagueId = await this.resolveLeagueId(league);
    const rows = await this.request('standings', { league: leagueId, season: env.SPORTS_API_SEASON });
    const standings = rows[0]?.league?.standings?.[0] ?? [];
    return standings.map((row) => ({
      position: row.rank,
      team: row.team?.name ?? 'Unknown team',
      points: row.points ?? 0,
      played: row.all?.played ?? 0,
      wins: row.all?.win ?? 0,
      draws: row.all?.draw ?? 0,
      losses: row.all?.lose ?? 0,
      goalsFor: row.all?.goals?.for ?? 0,
      goalsAgainst: row.all?.goals?.against ?? 0,
      source: 'api-football'
    }));
  }

  async getSeasonFixtures({ league = 'Premier League', season } = {}) {
    const year = Number(season);
    if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
      throw new Error('Season must be a year from 2000 through the current year');
    }
    const leagueId = await this.resolveLeagueId(league);
    const rows = [];
    // API-Football paginates fixture responses (commonly 100 rows per page).
    // Cap the loop so an unusual provider response cannot run indefinitely.
    for (let page = 1; page <= 10; page += 1) {
      const batch = await this.request('fixtures', { league: leagueId, season: year, page, timezone: 'Africa/Kampala' });
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows.map((row) => ({
      id: row.fixture?.id,
      home: row.teams?.home?.name ?? '',
      away: row.teams?.away?.name ?? '',
      homeGoals: row.goals?.home,
      awayGoals: row.goals?.away,
      status: row.fixture?.status?.short ?? '',
      date: row.fixture?.date,
      source: 'api-football'
    }));
  }

  async getTeamSummary(teamName) {
    const form = await this.getTeamFormStats(teamName, { limit: 5 });
    if (!form.length) return null;
    const { wins, draws, losses } = form[0];
    return `${teamName}: last ${form.length} completed matches — ${wins} wins, ${draws} draws, ${losses} losses.`;
  }
}

export default ApiFootballProvider;
