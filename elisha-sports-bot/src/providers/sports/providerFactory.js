import { env } from '../../config/env.js';
import { MockSportsDataProvider } from './mockSportsDataProvider.js';
import { ApiFootballProvider } from './apiFootballProvider.js';

let provider;
export function getSportsDataProvider() {
  if (provider) return provider;
  if (env.SPORTS_DATA_PROVIDER === 'api-football' || env.SPORTS_DATA_PROVIDER === 'football-data') {
    provider = new ApiFootballProvider();
    return provider;
  }
  provider = new MockSportsDataProvider();
  return provider;
}

export function resetSportsDataProvider() {
  provider = undefined;
}
