import { getSportsDataProvider } from '../providers/sports/providerFactory.js';

export async function getLineupContext(homeTeam, awayTeam) {
  const provider = getSportsDataProvider();
  if (typeof provider.getLineupContext !== 'function') {
    return { status: 'unsupported', source: null, note: 'The configured provider does not supply lineups.' };
  }
  return provider.getLineupContext(homeTeam, awayTeam);
}
