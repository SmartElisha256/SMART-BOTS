import { predictFootballMatch } from '../services/footballMlService.js';
import { isPredictionStrongEnough, logPrediction } from '../services/predictionLogService.js';
import {
  parseValueArgs,
  evaluateMarket,
  formatValueAnalysis
} from '../services/valueBetService.js';
import { logger } from '../utils/logger.js';
import { appendBettingDisclaimer } from './messages.js';

/**
 * Premium VALUE command: model vs bookmaker odds, strict PASS default.
 * Does not place bets. Disclaims no proven edge (see BETTING.md).
 */
export async function runValueCommand({ args, phone = null } = {}) {
  const parsed = parseValueArgs(args);
  if (parsed.error) {
    return appendBettingDisclaimer(
      `📊 VALUE CHECK\n\n${parsed.error}\n\nThis is a research tool. Backtests on our data show no proven model edge over the market.`
    );
  }

  const { home, away, odds, bankroll } = parsed;

  try {
    const prediction = await predictFootballMatch({
      homeTeam: home,
      awayTeam: away,
      kickoff: null
    });
    await logPrediction({ phone, prediction, sourceCommand: 'value' });

    const strength = isPredictionStrongEnough(prediction);
    const result = prediction?.match_result ?? {};
    const modelProbs = {
      home_win: Number(result.home_win),
      draw: Number(result.draw),
      away_win: Number(result.away_win)
    };

    if (!strength.ok || !Number.isFinite(modelProbs.home_win)) {
      return appendBettingDisclaimer(
        formatValueAnalysis({
          home,
          away,
          analysis: { selections: [], best: null, overround: 0, config: {} },
          bankroll,
          dataQualityOk: false,
          strengthOk: false,
          strengthReason: strength.reason || 'Could not obtain usable model probabilities.'
        })
      );
    }

    let analysis;
    try {
      analysis = evaluateMarket(modelProbs, odds);
    } catch (err) {
      return appendBettingDisclaimer(`📊 VALUE CHECK\n\nCould not evaluate odds: ${err.message}`);
    }

    return appendBettingDisclaimer(
      formatValueAnalysis({
        home,
        away,
        analysis,
        bankroll,
        dataQualityOk: true,
        strengthOk: true
      })
    );
  } catch (error) {
    logger.error({ error }, 'VALUE command failed');
    return appendBettingDisclaimer(
      '📊 VALUE CHECK\n\nAnalysis failed. Check team names and try ANALYZE first. No bet was suggested.'
    );
  }
}

export default runValueCommand;
