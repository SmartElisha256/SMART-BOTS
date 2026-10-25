import { z } from 'zod';
import { upsertUser } from './userService.js';
import { getUserPreferences, updateUserPreferences } from './preferencesService.js';
import { getUserSubscriptions } from './subscriptionService.js';
import { answerFootballQuestion } from './footballAssistantService.js';
import { detectFootballIntent } from './footballMlService.js';
import { logger } from '../utils/logger.js';
import { parseCommand } from '../commands/intentParser.js';
import { getMenuMessage, getHelpMessage, getFriendlyFallback, premiumRequiredMessage } from '../commands/messages.js';
import {
  handleFixturesCommand,
  handleLiveCommand,
  handleTableCommand,
  handleFormCommand,
  handleH2HCommand,
  handleSeasonCommand,
  handleLeaguesCommand
} from '../commands/sportsCommands.js';
import { runAnalyzeCommand, runTipCommand } from '../commands/analyzeCommand.js';
import { addAnalysisJob, isQueueAvailable } from '../jobs/queue.js';
import { maybeAppendUpgradePrompt } from './conversionService.js';
import { submitFeedback } from './feedbackService.js';

const commandRequestSchema = z.object({
  sender: z.string().min(5),
  message: z.string().trim().default(''),
  provider: z.enum(['whatsapp', 'callmebot', 'mock']).default('whatsapp')
});

async function getFootballAssistantReply(question) {
  try {
    return await answerFootballQuestion(question);
  } catch (error) {
    logger.warn({ error }, 'Open-ended football AI unavailable; using friendly fallback');
    return null;
  }
}

async function hasActivePremiumSubscription(phone) {
  const subscriptions = await getUserSubscriptions(phone);
  return subscriptions.some((subscription) =>
    String(subscription?.plan ?? '').toLowerCase() === 'premium' && subscription?.is_active !== false
  );
}

async function dispatchHeavyAnalysis({ sender, kind, args, provider }) {
  if (isQueueAvailable()) {
    try {
      const result = await addAnalysisJob({ phone: sender, kind, args, provider });
      if (result.queued) {
        if (result.deduped) {
          return '⏳ Your previous analysis request is still running. I will send the result here when it is ready.';
        }
        return '⏳ Working on your match analysis now. This can take up to about 30 seconds. I will send the full report in this chat when it is ready.';
      }
    } catch (error) {
      logger.warn({ error, sender, kind }, 'Could not enqueue analysis; running inline');
    }
  }

  if (kind === 'tip') return runTipCommand({ phone: sender });
  return runAnalyzeCommand(args, { phone: sender });
}

async function handleTeamCommand(sender, args) {
  const team = String(args ?? '').trim();
  if (!team) {
    const prefs = await getUserPreferences(sender);
    if (prefs?.preferred_team) {
      return (
        '⭐ Your favourite team: ' + prefs.preferred_team +
        '\n\nTry: FORM ' + prefs.preferred_team +
        '\nOr: FIXTURES\nClear with: TEAM CLEAR'
      );
    }
    return 'Set a favourite team: TEAM Arsenal\nThen use FORM / FIXTURES more easily. Clear with TEAM CLEAR.';
  }
  if (/^(clear|none|remove)$/i.test(team)) {
    await updateUserPreferences(sender, { preferred_team: null });
    return 'Favourite team cleared.';
  }
  await updateUserPreferences(sender, { preferred_team: team });
  return (
    '⭐ Favourite team saved: ' + team +
    '\n\nQuick actions:\n• FORM ' + team +
    '\n• Ask: How is ' + team + ' doing?'
  );
}

export { parseCommand, interpretNaturalLanguage } from '../commands/intentParser.js';

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

    let reply;

    if (!command) {
      const aiReply = await getFootballAssistantReply(raw);
      reply = aiReply || getFriendlyFallback();
    } else {
      switch (command) {
        case 'menu':
          reply = getMenuMessage();
          break;

        case 'help':
          reply = getHelpMessage();
          break;

        case 'upgrade':
          reply = 'Reply UPGRADE to see Premium plans and payment instructions.';
          break;

        case 'leagues':
        case 'league':
          reply = handleLeaguesCommand();
          break;

        case 'team':
        case 'myteam':
          reply = await handleTeamCommand(sender, args);
          break;

        case 'football_help': {
          if (detectFootballIntent(raw) === 'ml_ai') {
            reply = 'Please include the two teams for a match prediction, for example: Arsenal vs Chelsea, who might win?';
          } else {
            const aiReply = await getFootballAssistantReply(raw);
            reply = aiReply || getFriendlyFallback();
          }
          break;
        }

        case 'fixtures':
          reply = await handleFixturesCommand(args);
          break;

        case 'tip':
        case 'tips':
          reply = await dispatchHeavyAnalysis({
            sender,
            kind: 'tip',
            args: null,
            provider: payload.provider
          });
          break;

        case 'live':
          reply = await handleLiveCommand(args);
          break;

        case 'table':
          reply = await handleTableCommand(args);
          break;

        case 'form': {
          const teamArg = args || prefs?.preferred_team;
          reply = await handleFormCommand(teamArg);
          break;
        }

        case 'h2h':
          reply = await handleH2HCommand(args);
          break;

        case 'analyze':
        case 'analysis':
          if (!(await hasActivePremiumSubscription(sender))) {
            reply = premiumRequiredMessage();
          } else {
            reply = await dispatchHeavyAnalysis({
              sender,
              kind: 'analyze',
              args,
              provider: payload.provider
            });
          }
          break;

        case 'season':
        case 'historical':
          if (!(await hasActivePremiumSubscription(sender))) {
            reply = premiumRequiredMessage();
          } else {
            reply = await handleSeasonCommand(args);
          }
          break;

        case 'start':
          await updateUserPreferences(sender, { notifications_enabled: true });
          reply = 'Notifications enabled. You will now receive match alerts.';
          break;

        case 'stop':
          await updateUserPreferences(sender, { notifications_enabled: false });
          reply = 'Notifications disabled. You will not receive match alerts.';
          break;

        case 'feedback':
        case 'review':
          reply = await submitFeedback({ phone: sender, text: args || '' });
          break;

        default:
          logger.warn({ phone: sender, command }, 'Unknown command');
          reply = `Unknown command: "${raw}". Reply with MENU or HELP.`;
      }
    }

    // Soft conversion prompt for free users after several useful replies
    if (command && !['upgrade', 'menu', 'help', 'feedback', 'review'].includes(command)) {
      reply = await maybeAppendUpgradePrompt(sender, reply);
    }

    return reply;
  } catch (error) {
    logger.error({ error }, 'Error processing incoming message');
    return 'An error occurred. Please try again later.';
  }
}

export default processIncomingMessage;
