import { getSportsDataProvider } from '../providers/sports/providerFactory.js';

export async function getPlayerAvailability(teamName) {
  const provider = getSportsDataProvider();
  if (typeof provider.getTeamAvailability !== 'function') {
    return { team: teamName, status: 'unsupported', injuries: [], source: null, note: 'The configured provider does not supply injury/suspension data.' };
  }
  return provider.getTeamAvailability(teamName);
}
