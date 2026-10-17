import { getSportsDataProvider } from '../providers/sports/providerFactory.js';

export async function getTeamStrength(teamName, options = {}) {
  const provider = getSportsDataProvider();
  if (typeof provider.getTeamStrength !== 'function') {
    return { team: teamName, status: 'unsupported', source: null, note: 'The configured provider does not supply season team statistics.' };
  }
  return provider.getTeamStrength(teamName, options);
}
