import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCommandName,
  isQuotaTrackedMessage,
  getDailyRequestLimit,
  getKampalaDate,
  getNextKampalaMidnight,
  formatQuotaLimitMessage
} from '../src/services/usageService.js';

test('tracks football-data commands but not help or preference commands', () => {
  assert.equal(isQuotaTrackedMessage('FIXTURES'), true);
  assert.equal(isQuotaTrackedMessage('ANALYZE Arsenal vs Chelsea'), true);
  assert.equal(isQuotaTrackedMessage('SEASON Premier League 2024'), true);
  assert.equal(isQuotaTrackedMessage('MENU'), false);
  assert.equal(isQuotaTrackedMessage('HELP'), false);
  assert.equal(isQuotaTrackedMessage('START'), false);
  assert.equal(isQuotaTrackedMessage('something-unknown'), false);
});

test('extracts a command name from a message', () => {
  assert.equal(getCommandName('  FORM Arsenal  '), 'form');
  assert.equal(getCommandName(''), '');
});

test('uses configured defaults for free and premium plans', () => {
  assert.equal(getDailyRequestLimit('free'), 20);
  assert.equal(getDailyRequestLimit('premium'), 200);
});

test('uses Kampala calendar date rather than UTC date', () => {
  assert.equal(getKampalaDate(new Date('2026-10-10T21:30:00.000Z')), '2026-10-11');
  assert.equal(getKampalaDate(new Date('2026-10-10T20:59:59.000Z')), '2026-10-10');
});

test('calculates next midnight in Kampala time', () => {
  assert.equal(getNextKampalaMidnight(new Date('2026-10-10T12:00:00.000Z')).toISOString(), '2026-10-10T21:00:00.000Z');
});

test('free and premium limit messages show the reset time and appropriate plan text', () => {
  const resetAt = new Date('2026-10-10T21:00:00.000Z');
  const freeMessage = formatQuotaLimitMessage({ plan: 'free', limit: 20, used: 20, resetAt });
  const premiumMessage = formatQuotaLimitMessage({ plan: 'premium', limit: 200, used: 200, resetAt });
  assert.match(freeMessage, /FREE DAILY LIMIT REACHED/);
  assert.match(freeMessage, /Premium activation is not automatic yet/);
  assert.match(premiumMessage, /PREMIUM DAILY LIMIT REACHED/);
  assert.match(premiumMessage, /wait until it resets/);
});
