import { z } from 'zod';
import { upsertUser, findUserByPhone } from './userService.js';
import { getUserPreferences, updateUserPreferences } from './preferencesService.js';
import { getUserSubscriptions, subscribeUser, unsubscribeUser } from './subscriptionService.js';
import { getUpcomingFixtures, getLeagueTable, getTeamFormStats, getHeadToHeadRecord } from './sportsService.js';
import { logger } from '../utils/logger.js';

const commandRequestSchema = z.object({
  sender: z.string().min(5),
  message: z.string().trim().default(''),
  provider: z.enum(['whatsapp', 'callmebot', 'mock']).default('whatsapp')
});

const COMMAND_REGEX = /^([a-z]+)(?:\\s+(.+))?$/i;

export function parseCommand(input) {
  const normalized = String(input).trim().toLowerCase();
  const match = normalized.match(COMMAND_REGEX);

  if (!match) {
    return { command: null, args: null, raw: normalized };
  }

  return {
    command: match[1],
    args: match[2] ? match[2].trim() : null,
    raw: normalized
  };
}

export async function processIncomingMessage(input) {
  try {
    const payload = commandRequestSchema.parse(input);
    const sender = payload.sender.trim();
    const { command, args, raw } = parseCommand(payload.message);

    await upsertUser({ phone: sender, provider: payload.provider });
    const prefs = await getUserPreferences(sender);

    logger.info(
      { phone: sender, command, args, provider: payload.provider },
      'Processing incoming message'
    );

    if (!command) {
      return getHelpMessage();
    }

    switch (command) {
      case 'menu':
        return getMenuMessage();

      case 'help':
        return getHelpMessage();

      case 'fixtures':
        return await handleFixturesCommand(args);

      case 'live':
        return await handleLiveCommand(args);

      case 'table':
        return await handleTableCommand(args);

      case 'form':
        return await handleFormCommand(args);

      case 'h2h':
        return await handleH2HCommand(args);

      case 'start':
        await updateUserPreferences(sender, { notifications_enabled: true });
        return 'Notifications enabled. You will now receive match alerts.';

      case 'stop':
        await updateUserPreferences(sender, { notifications_enabled: false });
        return 'Notifications disabled. You will not receive match alerts.';

      default:
        logger.warn({ phone: sender, command }, 'Unknown command');
        return `Unknown command: "${raw}". Reply with MENU or HELP.`;
    }
  } catch (error) {
    logger.error({ error }, 'Error processing incoming message');
    return 'An error occurred. Please try again later.';
  }
}

function getMenuMessage() {
  return `🏟️ ELISHA SPORTS BOT

Available commands:

• MENU — show this menu
• FIXTURES — upcoming matches
• LIVE — live scores (when available)
• TABLE — league standings
• FORM [TEAM] — recent results for a team
• H2H [TEAM A] vs [TEAM B] — head-to-head stats
• HELP — usage guide
• START — enable notifications
• STOP — disable notifications`;
}

function getHelpMessage() {
  return `📖 HELP - How to use ELISHA SPORTS BOT

Examples:

FIXTURES
  Shows next 3 upcoming matches.

TABLE
  Shows league standings (top 5 teams).

FORM Arsenal
  Shows Arsenal's last 5 matches.

H2H Manchester City vs Liverpool
  Shows historical head-to-head record.

LIVE
  Shows current live scores (when available).

START / STOP
  Enable or disable match notifications.

Reply MENU for all commands.`;
}

async function handleFixturesCommand(args) {
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

    return `📅 UPCOMING FIXTURES\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching fixtures');
    return 'Could not fetch fixtures. Please try again.';
  }
}

async function handleLiveCommand(args) {
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

async function handleTableCommand(args) {
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

    return `📊 LEAGUE TABLE - ${league}\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching table');
    return 'Could not fetch standings. Please try again.';
  }
}

async function handleFormCommand(args) {
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

async function handleH2HCommand(args) {
  if (!args || !args.includes(' vs ') && !args.includes(' v ')) {
    return 'Usage: H2H Manchester City vs Liverpool';
  }

  try {
    const parts = args.split(/\\s+vs?\\s+/i);
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

export default processIncomingMessage;
