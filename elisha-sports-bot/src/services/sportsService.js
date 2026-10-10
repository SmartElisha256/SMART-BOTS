import { z } from 'zod';
import { mockSportsProvider } from '../providers/sports/mockSportsProvider.js';

const sportsQuerySchema = z.object({
  limit: z.number().int().min(1).max(10).default(3),
  onlyResults: z.boolean().default(false)
});

export async function getUpcomingFixtures(options = {}) {
  const payload = sportsQuerySchema.parse(options);
  const provider = mockSportsProvider;
  const fixtures = await provider.getFixtures({ limit: payload.limit, onlyResults: payload.onlyResults });
  return fixtures;
}

export async function getLeagueTable() {
  const provider = mockSportsProvider;
  return provider.getLeagueTable();
}

export async function getMatchSummary(teamName) {
  const provider = mockSportsProvider;
  return provider.getTeamSummary(teamName);
}
