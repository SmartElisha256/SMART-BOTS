import { env } from '../config/env.js';
import { createCircuitBreaker } from '../utils/circuitBreaker.js';
import { logger } from '../utils/logger.js';

const BETTING_TERMS = /\b(bet|betting|stake|odds|tip|prediction|predict|win probability|double chance|1x2|over\/under|btts|both teams to score|correct score|accumulator)\b/i;
const DISCLAIMER = 'Disclaimer: This statistical analysis is intended for adults aged 18 and above. Gambling can be psychologically harmful and can lead to financial loss. Tips are derived from statistical analysis, not certainty. Use any tips responsibly and stake only what you can afford to lose.';
const MAX_QUESTION_LENGTH = 1200;
const AI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) > 0
  ? Number(process.env.OPENAI_TIMEOUT_MS)
  : 15_000;

const aiCircuit = createCircuitBreaker({
  name: 'openai-assistant',
  failureThreshold: 5,
  resetMs: 60_000,
  logger
});

function extractResponseText(data) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

/**
 * Answers open-ended football questions when an AI provider is configured.
 * Does not pretend to have live data; limits keep cost and WhatsApp size predictable.
 */
export async function answerFootballQuestion(question) {
  const text = String(question ?? '').trim().slice(0, MAX_QUESTION_LENGTH);
  if (!text) return null;
  if (!env.OPENAI_API_KEY) return null;

  return aiCircuit.exec(async () => {
    const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, '')}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json'
      },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        instructions: [
          'You are ELISHA SPORTS BOT, a helpful football/soccer assistant for WhatsApp.',
          'Answer the user’s actual question clearly and naturally. You may explain football rules, tactics, formations, player roles, historical context, competitions, training concepts, and how football statistics work.',
          'Keep replies concise, helpful, and easy to read on a phone.',
          'Do not claim access to live scores, current injuries, lineups, transfers, odds, fixtures, or recent results unless that information was explicitly supplied in the question or is available from a connected data tool. This assistant call has no live data feed.',
          'Never invent statistics, sources, match facts, or probabilities. If the question depends on current or match-specific data you do not have, say so plainly and suggest the user ask for FIXTURES, LIVE, TABLE, FORM [TEAM], H2H [TEAM A] vs [TEAM B], or ANALYZE [TEAM A] vs [TEAM B] where available.',
          'If asked for a match prediction without reliable match data, explain what information would be needed instead of making up a pick. Never guarantee outcomes.',
          'If the question is not about football/soccer, politely explain that you specialize in football and invite a football question.',
          'Do not present gambling as a way to make money or encourage risky betting.'
        ].join(' '),
        input: text,
        max_output_tokens: 350
      })
    });

    if (!response.ok) {
      throw new Error(`Football AI provider returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const answer = extractResponseText(data);
    if (!answer) return null;

    const safeAnswer = answer.slice(0, 3000);
    return BETTING_TERMS.test(text) ? `${safeAnswer}\n\n${DISCLAIMER}` : safeAnswer;
  });
}

export function getAiCircuitState() {
  return aiCircuit.getState();
}
