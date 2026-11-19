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

const SYSTEM_PROMPT = [
  'You are ELISHA SPORTS BOT, a helpful football/soccer assistant for WhatsApp.',
  'Answer the user\'s actual question clearly and naturally. You may explain football rules, tactics, formations, player roles, historical context, competitions, training concepts, and how football statistics work.',
  'Keep replies concise, helpful, and easy to read on a phone.',
  'Do not claim access to live scores, current injuries, lineups, transfers, odds, fixtures, or recent results unless that information was explicitly supplied in the question.',
  'Never invent statistics, sources, match facts, or probabilities. If the question needs current data, suggest FIXTURES, TABLE, FORM, H2H, or ANALYZE.',
  'Never guarantee outcomes. Do not present gambling as a way to make money.',
  'If the question is not about football/soccer, politely explain that you specialize in football.'
].join(' ');

function extractResponsesApiText(data) {
  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
}

function extractChatCompletionsText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n')
      .trim();
  }
  return '';
}

function useChatCompletions() {
  const style = String(env.OPENAI_API_STYLE || '').toLowerCase();
  if (style === 'chat' || style === 'chat_completions') return true;
  if (style === 'responses') return false;
  const base = String(env.OPENAI_BASE_URL || '').toLowerCase();
  return base.includes('openrouter.ai') || base.includes('localhost');
}

export async function answerFootballQuestion(question) {
  const text = String(question ?? '').trim().slice(0, MAX_QUESTION_LENGTH);
  if (!text) return null;
  if (!env.OPENAI_API_KEY) return null;

  return aiCircuit.exec(async () => {
    const base = env.OPENAI_BASE_URL.replace(/\/$/, '');
    const chatMode = useChatCompletions();
    const url = chatMode ? `${base}/chat/completions` : `${base}/responses`;
    const body = chatMode
      ? {
          model: env.OPENAI_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text }
          ],
          max_tokens: 350,
          temperature: 0.4
        }
      : {
          model: env.OPENAI_MODEL,
          instructions: SYSTEM_PROMPT,
          input: text,
          max_output_tokens: 350
        };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/SmartElisha256/SMART-BOTS',
        'X-Title': 'ELISHA SPORTS BOT'
      },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify(body)
    });

    if (response.status === 429) {
      throw new Error('AI rate limit reached. Try again later or use ANALYZE / MENU commands.');
    }
    if (!response.ok) {
      throw new Error(`Football AI provider returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const answer = chatMode ? extractChatCompletionsText(data) : extractResponsesApiText(data);
    if (!answer) return null;

    const safeAnswer = answer.slice(0, 3000);
    return BETTING_TERMS.test(text) ? `${safeAnswer}\n\n${DISCLAIMER}` : safeAnswer;
  });
}

export function getAiCircuitState() {
  return aiCircuit.getState();
}

export function isAiConfigured() {
  return Boolean(String(env.OPENAI_API_KEY || '').trim());
}
