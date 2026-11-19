import test from 'node:test';
import assert from 'node:assert/strict';

import { getSportsDataProvider, resetSportsDataProvider } from '../src/providers/sports/providerFactory.js';

test('sports provider factory resolves a provider implementation', () => {
  resetSportsDataProvider();
  const provider = getSportsDataProvider();
  assert.ok(provider);
  assert.equal(typeof provider.getFixtures, 'function');
  resetSportsDataProvider();
});
