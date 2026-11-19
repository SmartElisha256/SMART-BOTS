import { env } from '../../config/env.js';
import { MockSportsProvider } from './mockSportsProvider.js';
import { ApiFootballProvider } from './apiFootballProvider.js';

let provider;

export function getSportsDataProvider() {
  if (provider) return provider;

  if (env.SPORTS_DATA_PROVIDER === 'api-football' || env.SPORTS_DATA_PROVIDER === 'football-data') {
    provider = new ApiFootballProvider();
    return provider;
  }

  provider = new MockSportsProvider();
  return provider;
}

export function resetSportsDataProvider() {
  provider = undefined;
}
