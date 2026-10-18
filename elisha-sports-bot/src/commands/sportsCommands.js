import { getUpcomingFixtures, getLeagueTable, getTeamFormStats, getHeadToHeadRecord, getHistoricalSeasonFixtures } from '../services/sportsService.js';
import { formatSeasonReport } from '../services/historicalSeasonService.js';
import { logger } from '../utils/logger.js';

export async function handleFixturesCommand(args) {
  try {
    const limit = args ? Math.min(parseInt(args) || 3, 10) : 3;
    const fixtures = await getUpcomingFixtures({ limit, onlyResults: false });

    if (!fixtures || fixtures.length === 0) {
      return 'No upcoming fixtures available.';
    }

    const list = fixtures
      .map((match, idx) => {
        const time = new Date(match.time).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        return `${idx + 1}. ${match.home} vs ${match.away}\n   ${time}`;
      })
      .join('\n\n');

    return fixtures[0]?.source === 'api-football'
      ? `📅 UPCOMING FIXTURES\n\n${list}\n\nSource: football data API`
      : `⚠️ DEMO DATA — not live or official\n\n📅 SAMPLE FIXTURES\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching fixtures');
    return 'Could not fetch fixtures. Please try again.';
  }
}

export async function handleLiveCommand() {
  try {
    const liveMatches = await getUpcomingFixtures({ limit: 5, liveOnly: true });

    if (!liveMatches || liveMatches.length === 0) {
      return 'No live matches at the moment.';
    }

    const list = liveMatches
      .map((match) => {
        const score = match.score ? `${match.score}` : 'LIVE';
        const status = match.status ?? 'In Progress';
        return `⚽ ${match.home} ${score} ${match.away}\n   (${status})`;
      })
      .join('\n\n');

    return `🔴 LIVE MATCHES\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching live scores');
    return 'Could not fetch live scores. Please try again.';
  }
}

export async function handleTableCommand(args) {
  try {
    const league = args ?? 'Premier League';
    const table = await getLeagueTable({ league, limit: 5 });

    if (!table || table.length === 0) {
      return `No standings available for ${league}.`;
    }

    const list = table
      .map(
        (entry) => `${String(entry.position).padStart(2, ' ')}. ${entry.team.padEnd(20)} ${String(entry.points).padStart(2)}pts`
      )
      .join('\n');

    return table[0]?.source === 'api-football'
      ? `📊 LEAGUE TABLE - ${league}\n\n${list}\n\nSource: football data API`
      : `⚠️ DEMO DATA — not live or official\n\n📊 SAMPLE LEAGUE TABLE - ${league}\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching table');
    return 'Could not fetch standings. Please try again.';
  }
}

export async function handleFormCommand(args) {
  if (!args) {
    return 'Please specify a team. Example: FORM Arsenal';
  }

  try {
    const team = args.trim();
    const form = await getTeamFormStats(team, { limit: 5 });

    if (!form || form.length === 0) {
      return `No recent form data found for ${team}.`;
    }

    const results = form
      .map((match) => {
        if (match.result === 'W') return '✅ W';
        if (match.result === 'D') return '⚪ D';
        if (match.result === 'L') return '❌ L';
        return '? -';
      })
      .join(' ');

    const stats = form[0];
    const summary = `${stats.wins}W ${stats.draws}D ${stats.losses}L`;

    return `📈 RECENT FORM - ${team}\n\nLast 5: ${results}\n${summary}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching form');
    return `Could not fetch form for ${args}. Please try again.`;
  }
}

export async function handleH2HCommand(args) {
  if (!args || (!args.includes(' vs ') && !args.includes(' v '))) {
    return 'Usage: H2H Manchester City vs Liverpool';
  }

  try {
    const parts = args.split(/\s+vs?\s+/i);
    if (parts.length !== 2) {
      return 'Usage: H2H Manchester City vs Liverpool';
    }

    const [teamA, teamB] = [parts[0].trim(), parts[1].trim()];
    const record = await getHeadToHeadRecord(teamA, teamB);

    if (!record) {
      return `No head-to-head data found for ${teamA} vs ${teamB}.`;
    }

    return `🏆 HEAD-TO-HEAD: ${teamA} vs ${teamB}\n\n${teamA}: ${record.wins_a} wins\n${teamB}: ${record.wins_b} wins\nDraws: ${record.draws}\n\nLast match: ${record.last_match_date}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching H2H');
    return 'Could not fetch head-to-head data. Please try again.';
  }
}

export async function handleSeasonCommand(args) {
  const match = String(args ?? '').trim().match(/^(.*?)(?:\s+)?(20\d{2})$/);
  if (!match) return 'Usage: SEASON Premier League 2023';
  const league = match[1].trim() || 'Premier League';
  const season = Number(match[2]);
  try {
    const fixtures = await getHistoricalSeasonFixtures({ league, season });
    return formatSeasonReport({ league, season, fixtures, limit: 10 });
  } catch (error) {
    logger.warn({ error, league, season }, 'Historical season report unavailable');
    return `Could not load historical data for ${league} ${season}. Check the configured data provider, API key, and historical-season access.`;
  }
}
