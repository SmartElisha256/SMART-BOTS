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
  handleSeasonCommand
} from '../commands/sportsCommands.js';
import { runAnalyzeCommand, runTipCommand } from '../commands/analyzeCommand.js';
import { addAnalysisJob, isQueueAvailable } from '../jobs/queue.js';

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

/**
 * Heavy analysis: prefer BullMQ so the WhatsApp webhook returns quickly.
 * Falls back to in-request execution when Redis is unavailable.
 */
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

  if (kind === 'tip') return runTipCommand();
  return runAnalyzeCommand(args);
}

export { parseCommand, interpretNaturalLanguage } from '../commands/intentParser.js';

export async function processIncomingMessage(input) {
  try {
    const payload = commandRequestSchema.parse(input);
    const sender = payload.sender.trim();
    const { command, args, raw } = parseCommand(payload.message);

    await upsertUser({ phone: sender, provider: payload.provider });
    await getUserPreferences(sender);

    logger.info(
      { phone: sender, command, args, provider: payload.provider },
      'Processing incoming message'
    );

    if (!command) {
      const aiReply = await getFootballAssistantReply(raw);
      if (aiReply) return aiReply;
      return getFriendlyFallback();
    }

    switch (command) {
      case 'menu':
        return getMenuMessage();

      case 'help':
        return getHelpMessage();

      case 'upgrade':
        return 'Reply UPGRADE to see Premium plans and payment instructions.';

      case 'football_help': {
        if (detectFootballIntent(raw) === 'ml_ai') {
          return 'Please include the two teams for a match prediction, for example: Arsenal vs Chelsea, who might win?';
        }
        const aiReply = await getFootballAssistantReply(raw);
        return aiReply || getFriendlyFallback();
      }

      case 'fixtures':
        return await handleFixturesCommand(args);

      case 'tip':
      case 'tips':
        return await dispatchHeavyAnalysis({
          sender,
          kind: 'tip',
          args: null,
          provider: payload.provider
        });

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
        return await dispatchHeavyAnalysis({
          sender,
          kind: 'analyze',
          args,
          provider: payload.provider
        });

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

export default processIncomingMessage;
