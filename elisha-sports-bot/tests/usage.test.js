import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCommandName,
  isQuotaTrackedMessage,
  getDailyRequestLimit,
  getMonthlyRequestLimit,
  getKampalaDate,
  getNextKampalaMidnight,
  formatQuotaLimitMessage,
  claimQuotaNotice
} from '../src/services/usageService.js';

test('tracks football-data and natural-language requests but not help or preference commands', () => {
  assert.equal(isQuotaTrackedMessage('FIXTURES'), true);
  assert.equal(isQuotaTrackedMessage('ANALYZE Arsenal vs Chelsea'), true);
  assert.equal(isQuotaTrackedMessage('SEASON Premier League 2024'), true);
  assert.equal(isQuotaTrackedMessage('MENU'), false);
  assert.equal(isQuotaTrackedMessage('HELP'), false);
  assert.equal(isQuotaTrackedMessage('START'), false);
  assert.equal(isQuotaTrackedMessage('something-unknown'), true);
  assert.equal(isQuotaTrackedMessage('Explain the offside rule'), true);
  assert.equal(isQuotaTrackedMessage('hello'), false);
});

test('extracts a command name from a message', () => {
  assert.equal(getCommandName('  FORM Arsenal  '), 'form');
  assert.equal(getCommandName(''), '');
});

test('uses configured defaults for free and premium plans', () => {
  assert.equal(getDailyRequestLimit('free'), 20);
  assert.equal(getDailyRequestLimit('premium'), 200);
  assert.equal(getMonthlyRequestLimit('premium'), 300);
  assert.equal(getMonthlyRequestLimit('free'), null);
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
  const premiumMessage = formatQuotaLimitMessage({ plan: 'premium', limit: 10, used: 10, monthlyLimit: 300, monthlyUsed: 10, resetAt });
  assert.match(freeMessage, /FREE DAILY LIMIT REACHED/);
  assert.match(freeMessage, /free allowance resets at/);
  assert.match(freeMessage, /Send UPGRADE/);
  assert.match(freeMessage, /MENU or HELP/);
  assert.match(freeMessage, /Avoid repeatedly sending the same request/);
  assert.match(premiumMessage, /PREMIUM DAILY LIMIT REACHED/);
  assert.match(premiumMessage, /Wait for the daily reset/);
  assert.match(premiumMessage, /Send UPGRADE/);
  assert.match(premiumMessage, /Monthly usage: 10\/300 requests/);
  const monthlyMessage = formatQuotaLimitMessage({ plan: 'premium', period: 'month', limit: 300, used: 300, monthlyLimit: 300, monthlyUsed: 300 });
  assert.match(monthlyMessage, /PREMIUM MONTHLY LIMIT REACHED/);
  assert.match(monthlyMessage, /300\/300 requests/);
  assert.match(monthlyMessage, /1st of next month/);
  assert.match(monthlyMessage, /Send UPGRADE/);
});


test('quota notices are claimed only once per user and quota period', async () => {
  const phone = 'test-quota-notice-' + Date.now();
  assert.equal(await claimQuotaNotice(phone, 'day'), true);
  assert.equal(await claimQuotaNotice(phone, 'day'), false);
  assert.equal(await claimQuotaNotice(phone, 'month'), true);
  assert.equal(await claimQuotaNotice(phone, 'month'), false);
});
