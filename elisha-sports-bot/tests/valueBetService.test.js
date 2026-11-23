import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMarket,
  parseValueArgs,
  stakeFor,
  DEFAULT_VALUE_CONFIG
} from '../src/services/valueBetService.js';

test('parseValueArgs extracts teams odds and bankroll', () => {
  const p = parseValueArgs('Arsenal vs Chelsea 1.80 3.90 4.60 BANKROLL 1000');
  assert.equal(p.home, 'Arsenal');
  assert.equal(p.away, 'Chelsea');
  assert.equal(p.odds.home, 1.8);
  assert.equal(p.bankroll, 1000);
});

test('evaluateMarket usually PASSes when model matches market', () => {
  const model = { home_win: 0.45, draw: 0.28, away_win: 0.27 };
  const odds = { home: 2.05, draw: 3.4, away: 3.6 };
  const res = evaluateMarket(model, odds);
  assert.ok(Array.isArray(res.selections));
  assert.equal(res.selections.length, 3);
  assert.equal(res.best, null);
});

test('evaluateMarket stake capped when a pick qualifies', () => {
  const model = { home_win: 0.55, draw: 0.25, away_win: 0.2 };
  const odds = { home: 2.5, draw: 3.5, away: 3.0 };
  const res = evaluateMarket(model, odds, { ...DEFAULT_VALUE_CONFIG, minEdge: 0.01, minEv: 0.02 });
  if (res.best) {
    const s = stakeFor(res.best, 1000);
    assert.ok(s >= 0);
    assert.ok(s <= 20);
  }
});

test('parseValueArgs rejects missing odds', () => {
  const p = parseValueArgs('Arsenal vs Chelsea');
  assert.ok(p.error);
});
