import { getUpcomingFixtures } from '../services/sportsService.js';
import { getMatchContext, formatMatchContext } from '../services/fixtureContextService.js';
import { answerFootballQuestion } from '../services/footballAssistantService.js';
import { predictFootballMatch, formatMlPrediction } from '../services/footballMlService.js';
import { logPrediction, isPredictionStrongEnough } from '../services/predictionLogService.js';
import { logger } from '../utils/logger.js';
import { appendBettingDisclaimer } from './messages.js';

async function getFootballAssistantReply(question) {
  try {
    return await answerFootballQuestion(question);
  } catch (error) {
    logger.warn({ error }, 'Open-ended football AI unavailable; using friendly fallback');
    return null;
  }
}

export async function runTipCommand({ phone = null } = {}) {
  try {
    const fixtures = await getUpcomingFixtures({ limit: 5, onlyResults: false });
    if (!fixtures || fixtures.length === 0) {
      return appendBettingDisclaimer('⚽ TODAY’S TIP\n\nI cannot responsibly suggest a match pick because no upcoming fixtures are available from the configured data source. Please try FIXTURES later. I will not invent a match or probability.');
    }
    const list = fixtures.map((match, index) => {
      const time = match.time
        ? new Date(match.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Kickoff time unavailable';
      return `${index + 1}. ${match.home} vs ${match.away}\n   ${time}`;
    }).join('\n\n');
    if (fixtures[0]?.source !== 'api-football') {
      return appendBettingDisclaimer(`⚽ TODAY’S TIP — FIXTURE CHECK\n\n⚠️ DEMO DATA — these are not verified live fixtures, so I will not run or present an ML prediction for them.\n\n${list}\n\nTry again when verified fixtures are available.`);
    }
    const selected = fixtures[0];
    try {
      const prediction = await predictFootballMatch({
        homeTeam: selected.home,
        awayTeam: selected.away,
        kickoff: selected.time ?? null
      });
      await logPrediction({ phone, prediction, sourceCommand: 'tip' });

      const strength = isPredictionStrongEnough(prediction);
      if (!strength.ok) {
        return appendBettingDisclaimer(
          `⚽ TODAY’S TIP — DATA CHECK\n\nVerified fixture: ${selected.home} vs ${selected.away}\n\n⚠️ ${strength.reason}\n\nI will not invent a pick. You can still use FIXTURES, FORM, or H2H for factual context.`
        );
      }

      const mlText = formatMlPrediction(prediction);
      const aiText = await getFootballAssistantReply(
        `Explain this ML output using only the supplied values. Do not invent or alter probabilities, statistics, team news, or facts.\n${JSON.stringify({
          match_result: prediction.match_result,
          double_chance: prediction.double_chance,
          goal_markets: prediction.goal_markets,
          btts: prediction.btts,
          expected_goals: prediction.expected_goals,
          confidence: prediction.confidence,
          data_quality: prediction.data_quality
        })}`
      );
      return appendBettingDisclaimer(
        `⚽ TODAY’S ML + AI TIP\n\n${mlText}${aiText ? `\n\n🤖 AI EXPLANATION\n${aiText}` : ''}`
      );
    } catch (error) {
      logger.warn({ error }, 'ML prediction unavailable for today tip');
      return appendBettingDisclaimer(
        `⚽ TODAY’S TIP\n\nVerified fixtures are available, but the ML model could not produce a prediction. I will not invent a pick or probability. ${error.message}`
      );
    }
  } catch (error) {
    logger.error({ error }, 'Error checking fixtures for tip request');
    return appendBettingDisclaimer(
      'I could not check fixtures for a tip right now. Please try again later. I will not make up a pick or probability.'
    );
  }
}

export async function runAnalyzeCommand(args, { phone = null } = {}) {
  if (!args || !/\s+vs?\s+/i.test(args)) return 'Usage: ANALYZE Arsenal vs Chelsea';
  const parts = args.split(/\s+vs?\s+/i);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    return 'Usage: ANALYZE Arsenal vs Chelsea';
  }
  const [teamA, teamB] = parts.map((part) => part.trim());

  const [predictionResult, contextResult] = await Promise.allSettled([
    predictFootballMatch({ homeTeam: teamA, awayTeam: teamB }),
    getMatchContext(teamA, teamB)
  ]);

  const prediction = predictionResult.status === 'fulfilled' ? predictionResult.value : null;
  const context = contextResult.status === 'fulfilled' ? contextResult.value : null;
  const contextText = context
    ? formatMatchContext(context)
    : 'PRE-MATCH SQUAD & TEAM CONTEXT\nContext providers failed or are unavailable; do not infer current injuries, lineups, or team statistics.';

  if (prediction) {
    await logPrediction({ phone, prediction, sourceCommand: 'analyze' });
  }

  const strength = isPredictionStrongEnough(prediction);
  const predictionText = prediction
    ? (strength.ok
      ? formatMlPrediction(prediction)
      : ('⚠️ MODEL OUTPUT HELD BACK\n' + strength.reason + '\n\nRaw probabilities are not shown as a tip when data quality is weak.'))
    : ('ML prediction unavailable: ' + (predictionResult.reason?.message || 'model unavailable'));

  if (!prediction && !context) {
    logger.warn(
      { teamA, teamB, predictionError: predictionResult.reason, contextError: contextResult.reason },
      'ML and match context both unavailable'
    );
    return '⚠️ MATCH ANALYSIS UNAVAILABLE\n\nI could not retrieve a model prediction or match context for ' +
      teamA + ' vs ' + teamB +
      '. I will not invent probabilities, injuries, lineups, or statistics. Check the deployed Python runtime, trained models, and configured football-data providers.';
  }

  let aiText = null;
  // Skip expensive AI when model was weak and only thin context remains — saves cost.
  const runAi = Boolean(prediction && strength.ok) || Boolean(context);
  if (runAi && prediction && strength.ok) {
    try {
      aiText = await getFootballAssistantReply([
        'Explain the supplied football evidence for the user.',
        'Use only facts and numerical values explicitly supplied below. Do not invent, update, or infer injuries, lineups, team news, recent results, probabilities, or statistics.',
        'Separate model estimates from retrieved context. Mention unavailable or low-quality data and explain uncertainty.',
        'Do not claim a forecast is certain.',
        'MODEL OUTPUT:\n' + JSON.stringify({
          fixture: prediction.fixture,
          match_result: prediction.match_result,
          machine_learning_result: prediction.machine_learning_result,
          double_chance: prediction.double_chance,
          goal_markets: prediction.goal_markets,
          btts: prediction.btts,
          expected_goals: prediction.expected_goals,
          correct_score: prediction.correct_score,
          confidence: prediction.confidence,
          data_quality: prediction.data_quality,
          features_used: prediction.features_used,
          model: prediction.model
        }),
        'RETRIEVED CONTEXT:\n' + contextText
      ].join('\n\n'));
    } catch (error) {
      logger.warn({ error, teamA, teamB }, 'AI explanation unavailable for match analysis');
    }
  }

  const partsOut = [
    '⚽ MATCH ANALYSIS\n' + predictionText,
    context
      ? ('\n\n📚 DATA & TEAM CONTEXT\n' + contextText)
      : '\n\n📚 DATA & TEAM CONTEXT\nCurrent context could not be retrieved; no current team-news claims are made.',
    aiText
      ? ('\n\n🤖 AI EXPLANATION\n' + aiText)
      : (prediction && !strength.ok
        ? '\n\nAI explanation skipped because the model output did not pass the data-quality gate.'
        : '\n\nAI explanation is unavailable; showing only successfully retrieved data and model output.')
  ];
  return appendBettingDisclaimer(partsOut.join(''));
}
