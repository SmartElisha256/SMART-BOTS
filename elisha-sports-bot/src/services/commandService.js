import { z } from 'zod';
import { upsertUser, findUserByPhone } from './userService.js';
import { getUserPreferences, updateUserPreferences } from './preferencesService.js';
import { getUserSubscriptions, subscribeUser, unsubscribeUser } from './subscriptionService.js';
import { getUpcomingFixtures, getLeagueTable, getTeamFormStats, getHeadToHeadRecord, getHistoricalSeasonFixtures } from './sportsService.js';
import { formatSeasonReport } from './historicalSeasonService.js';
import { analyzeMatch } from './analysisService.js';
import { getMatchContext, formatMatchContext } from './fixtureContextService.js';
import { logger } from '../utils/logger.js';

const commandRequestSchema = z.object({
  sender: z.string().min(5),
  message: z.string().trim().default(''),
  provider: z.enum(['whatsapp', 'callmebot', 'mock']).default('whatsapp')
});

const COMMAND_REGEX = /^([a-z0-9]+)(?:\s+(.+))?$/i;

const BETTING_DISCLAIMER = 'Disclaimer: This statistical analysis is intended for adults aged 18 and above. Gambling can be psychologically harmful and can lead to financial loss. Tips are derived from statistical analysis, not certainty. Use any tips responsibly and stake only what you can afford to lose.';
function appendBettingDisclaimer(message) { return `${message}\n\n${BETTING_DISCLAIMER}`; }

/**
 * Translate common conversational messages into the bot's existing commands.
 * This is a lightweight, deterministic intent matcher (no paid AI call), not
 * an unrestricted chatbot. It must not invent sports facts or predictions.
 */
export function interpretNaturalLanguage(input) {
  const text = String(input ?? '').trim().toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!text) return { command: null, args: null, raw: text };
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
    return { command: 'menu', args: null, raw: text };
  }
  if (/\b(help|what can you do|how do i use you)\b/.test(text)) {
    return { command: 'help', args: null, raw: text };
  }
  // Preserve explicit H2H command syntax before the general matchup interpreter.
  if (/^h2h\s+/.test(text)) return { command: 'h2h', args: text.replace(/^h2h\s+/, '').trim(), raw: text };
  if (/\b(today'?s? tips?|tips today|best pick today|today'?s? best pick|give me a tip|football tip today|today tip)\b/.test(text)) {
    return { command: 'tip', args: null, raw: text };
  }
  if (/\b(live scores?|scores? right now|matches live|what'?s live)\b/.test(text)) {
    return { command: 'live', args: null, raw: text };
  }
  if (/\b(fixtures?|matches today|games today|upcoming matches|what matches are on|who is playing today)\b/.test(text)) {
    return { command: 'fixtures', args: null, raw: text };
  }
  if (/\b(league table|standings|table for|show the table)\b/.test(text)) {
    const league = text.match(/(?:table for|standings for) (.+)$/)?.[1];
    return { command: 'table', args: league || null, raw: text };
  }

  const earlyH2H = text.replace(/[?!,]+/g, ' ').match(/^(?:please )?(?:show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)? (.+?) (?:vs|versus|against) (.+)$/);
  if (earlyH2H && earlyH2H[1] && earlyH2H[2]) return { command: 'h2h', args: earlyH2H[1].trim() + ' vs ' + earlyH2H[2].trim(), raw: text };

  const naturalH2HQuestion = text.replace(/[?!,]+/g, ' ').match(/^(?:what is|what's|tell me|please show|show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)?(?: for)? (.+?) (?:vs|versus|against) (.+)$/);
  if (naturalH2HQuestion && naturalH2HQuestion[1] && naturalH2HQuestion[2]) return { command: 'h2h', args: naturalH2HQuestion[1].trim() + ' vs ' + naturalH2HQuestion[2].trim(), raw: text };
  const matchup = text.replace(/[,?!]+/g, ' ').match(/(?:^|\b)(?:please )?(?:analyze|analyse|analysis|predict|prediction|who will win|who might win|who wins|tip for|odds for|what do you think about|compare)\s+(?:the\s+)?(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+?)(?:\s+(?:match|game|today|prediction|analysis))?$/);
  const plainMatchup = text.replace(/[,?!]+/g, ' ').match(/^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+?)(?:\s+(?:who will win|who might win|who wins|prediction|analysis|today))?$/);
  const pair = matchup || ((/\b(who will win|who might win|who wins|predict|prediction|analy[sz]e|analysis|h2h|head to head|tip)\b/.test(text)) ? plainMatchup : null);
  if (pair) {
    const teamA = (pair[1] ?? '').trim();
    const teamB = (pair[2] ?? '').trim().replace(/[, ]+$/g, '');
    if (teamA && teamB) {
      const command = /\b(h2h|head to head)\b/.test(text) ? 'h2h' : 'analyze';
      return { command, args: `${teamA} vs ${teamB}`, raw: text };
    }
  }

  const formMatch = text.match(/^(?:how is|how's|how are|tell me about|show me the form of|form of|recent form for)\s+(.+?)(?:\s+doing)?$/);
  if (formMatch?.[1] && !/^(the team|football|it)$/i.test(formMatch[1])) {
    return { command: 'form', args: formMatch[1].trim(), raw: text };
  }

  // Conversational football intents that do not use command syntax.
  const normalizedQuestion = text.replace(/[?!,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const h2hCommandLike = normalizedQuestion.match(/^(?:please )?(?:show|get|give me|check) (?:the )?(?:h2h|head to head)(?: record| stats| history)? (.+?) (?:vs|versus|against) (.+)$/);
  if (h2hCommandLike && h2hCommandLike[1] && h2hCommandLike[2]) {
    return { command: 'h2h', args: h2hCommandLike[1].trim() + ' vs ' + h2hCommandLike[2].trim(), raw: text };
  }
  const h2hNatural = normalizedQuestion.match(/(?:show|get|give me|check|what is|tell me)? ?(?:the )?(?:h2h|head to head)(?: record| stats| history)? for (.+?) (?:vs|versus|against) (.+)$/);
  if (h2hNatural && h2hNatural[1] && h2hNatural[2]) {
    return { command: 'h2h', args: h2hNatural[1].trim() + ' vs ' + h2hNatural[2].trim(), raw: text };
  }
  const formNatural = normalizedQuestion.match(/^(?:how is|how's|how are|tell me about|show me the form of|form of|recent form for|recent results for) (.+?)(?: doing)?$/);
  if (formNatural && formNatural[1] && !/^(the team|football|it)$/i.test(formNatural[1])) {
    return { command: 'form', args: formNatural[1].trim(), raw: text };
  }
  if (/\b(upgrade|premium plans?|pricing|subscribe|subscription)\b/.test(text)) {
    return { command: 'upgrade', args: null, raw: text };
  }
  const explicitCommand = text.match(COMMAND_REGEX);
  if (explicitCommand && /^(menu|help|fixtures|live|table|form|h2h|analyze|analysis|season|historical|tip|tips|start|stop)$/.test(explicitCommand[1])) {
    if (!(explicitCommand[1] === 'form' && /^form of\s+/.test(text))) {
      return { command: explicitCommand[1], args: explicitCommand[2] ? explicitCommand[2].trim() : null, raw: text };
    }
  }
  if (/\b(football|soccer|match|matches|team|teams|player|players|league|leagues|goal|goals|score|scores|win|draw|lose|lost|won|coach|manager|transfer|tournament|formation|referee|penalt(?:y|ies)|offsides?|corners?|cards?|shots on target|possession|lineups?|injuries|expected goals|xg|both teams to score|btts|double chance|correct score|tactics|transfer news|premier league|champions league)\b/.test(text)) {
    return { command: 'football_help', args: text, raw: text };
  }

  const commandMatch = text.match(COMMAND_REGEX);
  if (commandMatch) {
    return { command: commandMatch[1], args: commandMatch[2] ? commandMatch[2].trim() : null, raw: text };
  }
  return { command: null, args: null, raw: text };
}

export function parseCommand(input) {
  return interpretNaturalLanguage(input);
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
      return `I’m not sure what you mean yet. You can ask naturally, for example:\n• “What matches are on today?”\n• “How is Arsenal doing?”\n• “Arsenal vs Chelsea, who might win?”\n• “Today's tip”\n\nReply MENU to see everything I can do.`;
    }

    switch (command) {
      case 'menu':
        return getMenuMessage();

      case 'help':
        return getHelpMessage();

      case 'upgrade':
        return 'Reply UPGRADE to see Premium plans and payment instructions.';

      case 'football_help':
        return '⚽ I can help with fixtures, live scores, league tables, team form, head-to-head records, and available match analysis. Detailed corners, cards, player statistics, injuries, lineups, xG, and individual betting markets depend on connected data and may not be available yet. Tell me the teams or match you mean. I will not invent statistics or probabilities.';

      case 'fixtures':
        return await handleFixturesCommand(args);

      case 'tip':
      case 'tips':
        return await handleTipCommand();

      case 'live':
        return await handleLiveCommand(args);

      case 'table':
        return await handleTableCommand(args);

      case 'form':
        return await handleFormCommand(args);

      case 'h2h':
        return await handleH2HCommand(args);

      case 'analyze':
      case 'analysis':
        if (!(await hasActivePremiumSubscription(sender))) return premiumRequiredMessage();
        return await handleAnalyzeCommand(args);

      case 'season':
      case 'historical':
        if (!(await hasActivePremiumSubscription(sender))) return premiumRequiredMessage();
        return await handleSeasonCommand(args);

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
• Ask naturally — e.g. “What matches are on today?” or “How is Arsenal doing?”
• TIP / “Today's tip” — check available fixtures before requesting a match analysis
• FIXTURES — upcoming matches
• LIVE — live scores (when available)
• TABLE — league standings
• FORM [TEAM] — recent results for a team
• H2H [TEAM A] vs [TEAM B] — head-to-head stats
• ANALYZE [TEAM A] vs [TEAM B] — form, squad availability, strength, lineups, and data-quality analysis
• SEASON [LEAGUE] [YEAR] — historical season summary
• HELP — usage guide
• UPGRADE — view Premium plans and payment steps
• START — enable notifications
• STOP — disable notifications`;
}

function getHelpMessage() {
  return `📖 HELP - How to use ELISHA SPORTS BOT

Examples:

“What matches are on today?”
  Shows available upcoming fixtures.

“How is Arsenal doing?”
  Shows Arsenal's recent form.

“Arsenal vs Chelsea, who might win?”
  Requests detailed analysis (Premium required).

“Today's tip”
  Checks available fixtures; it will not invent a pick if reliable data is unavailable.

Voice notes
  Voice-note understanding is planned for a future upgrade. Please type your football question for now.

FIXTURES
  Shows next 3 upcoming matches.

TABLE
  Shows league standings (top 5 teams).

FORM Arsenal
  Shows Arsenal's last 5 matches.

H2H Manchester City vs Liverpool
  Shows historical head-to-head record.

ANALYZE Arsenal vs Chelsea
  Compares recent form, head-to-head, squad availability, team strength, lineup context, and data-quality warnings.

SEASON Premier League 2023
  Summarizes completed fixtures, points, goals, and home/away records for a historical season.

LIVE
  Shows current live scores (when available).

START / STOP
  Enable or disable match notifications.

UPGRADE\n  Shows Premium plans and manual payment instructions. Activation requires administrator verification.\n\nReply MENU for all commands.`;
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

    return fixtures[0]?.source === 'api-football' ? `📅 UPCOMING FIXTURES\n\n${list}\n\nSource: football data API` : `⚠️ DEMO DATA — not live or official\n\n📅 SAMPLE FIXTURES\n\n${list}`;
  } catch (error) {
    logger.error({ error }, 'Error fetching fixtures');
    return 'Could not fetch fixtures. Please try again.';
  }
}

async function handleTipCommand() {
  try {
    const fixtures = await getUpcomingFixtures({ limit: 5, onlyResults: false });
    if (!fixtures || fixtures.length === 0) {
      return appendBettingDisclaimer('⚽ TODAY’S TIP\n\nI cannot responsibly suggest a match pick because no upcoming fixtures are available from the configured data source. Please try FIXTURES later. I will not invent a match or probability.');
    }
    const list = fixtures.map((match, index) => {
      const time = match.time ? new Date(match.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Kickoff time unavailable';
      return `${index + 1}. ${match.home} vs ${match.away}\n   ${time}`;
    }).join('\n\n');
    const demo = fixtures[0]?.source !== 'api-football';
    return appendBettingDisclaimer(`⚽ TODAY’S TIP — FIXTURE CHECK\n\n${demo ? '⚠️ DEMO DATA — these are not verified live fixtures, so no pick or probability is provided.\n\n' : ''}${list}\n\nReply “ANALYZE Team A vs Team B” with a match you want assessed. Detailed analysis may require Premium.\n\nAny analysis is uncertain and is not a guarantee of a result.`);
  } catch (error) {
    logger.error({ error }, 'Error checking fixtures for tip request');
    return appendBettingDisclaimer('I could not check fixtures for a tip right now. Please try again later. I will not make up a pick or probability.');
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

    return table[0]?.source === 'api-football' ? `📊 LEAGUE TABLE - ${league}\n\n${list}\n\nSource: football data API` : `⚠️ DEMO DATA — not live or official\n\n📊 SAMPLE LEAGUE TABLE - ${league}\n\n${list}`;
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

async function handleSeasonCommand(args) {
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
export default processIncomingMessage;


async function handleAnalyzeCommand(args) {
  if (!args || !/\s+vs?\s+/i.test(args)) {
    return 'Usage: ANALYZE Arsenal vs Chelsea';
  }
  const parts = args.split(/\s+vs?\s+/i);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return 'Usage: ANALYZE Arsenal vs Chelsea';
  }
  const [teamA, teamB] = parts.map((part) => part.trim());
  try {
    const [formA, formB, h2h, context] = await Promise.all([
      getTeamFormStats(teamA, { limit: 5 }),
      getTeamFormStats(teamB, { limit: 5 }),
      getHeadToHeadRecord(teamA, teamB),
      getMatchContext(teamA, teamB).catch((error) => ({ dataQuality: { status: 'partial', warnings: [error.message] } }))
    ]);
    const analysis = await analyzeMatch({ teamA, teamB, formA, formB, h2h, matchContext: context ? formatMatchContext(context) : null });
    return appendBettingDisclaimer(analysis);
  } catch (error) {
    logger.error({ error, teamA, teamB }, 'Error analyzing match');
    return appendBettingDisclaimer('I could not analyze that match because the sports data service failed. Please try again later.');
  }
}


async function hasActivePremiumSubscription(phone) {
  const subscriptions = await getUserSubscriptions(phone);
  return subscriptions.some((subscription) =>
    String(subscription?.plan ?? '').toLowerCase() === 'premium' && subscription?.is_active !== false
  );
}

function premiumRequiredMessage() {
  return '🔒 PREMIUM FEATURE\n\nDetailed match analysis and historical season reports are available to active Premium subscribers.\n\nSend UPGRADE to view plans and payment instructions. Your access will activate only after an administrator verifies your payment.';
}
