import { env } from '../../config/env.js';
import { mockSportsProvider } from './mockSportsProvider.js';
import { ApiFootballProvider } from './apiFootballProvider.js';

let provider;
export function getSportsDataProvider() {
  if (provider) return provider;
  if (env.SPORTS_DATA_PROVIDER === 'api-football') {
    provider = new ApiFootballProvider();
    return provider;
  }
  return mockSportsProvider;
}

// Tests can inject a provider without requiring external API credentials.
export function setSportsDataProviderForTests(nextProvider) {
  provider = nextProvider;
}
