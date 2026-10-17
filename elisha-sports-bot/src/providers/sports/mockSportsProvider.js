import { SportsDataProvider } from './sportsDataProvider.js';

// Keep demonstration fixtures in the future so the mock provider remains useful
// for local development and tests regardless of the date the project is run.
function futureAt(daysFromNow, hour = 18, minute = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

const fixtures = [
  { home: 'Arsenal', away: 'Liverpool', time: futureAt(1, 18, 30), score: null },
  { home: 'Manchester City', away: 'Chelsea', time: futureAt(2, 16, 0), score: null },
  { home: 'Barcelona', away: 'Real Madrid', time: futureAt(3, 20, 30), score: null },
  { home: 'Bayern Munich', away: 'Inter Milan', time: '2026-10-11T19:00:00Z', score: '2-1' },
  { home: 'PSG', away: 'Juventus', time: '2026-10-10T18:45:00Z', score: '1-1' }
];

const table = [
  { position: 1, team: 'Arsenal', points: 21 },
  { position: 2, team: 'Liverpool', points: 20 },
  { position: 3, team: 'Manchester City', points: 18 },
  { position: 4, team: 'Chelsea', points: 16 },
  { position: 5, team: 'Barcelona', points: 15 }
];

export class MockSportsProvider extends SportsDataProvider {
  async getFixtures({ limit = 3, onlyResults = false, liveOnly = false } = {}) {
    // This provider is demonstration data, never a source of real live scores.
    if (liveOnly) return [];
    const now = Date.now();
    const selected = fixtures.filter((match) => {
      const isFuture = new Date(match.time).getTime() > now;
      return onlyResults ? Boolean(match.score) : isFuture && !match.score;
    }).slice(0, limit);
    return selected;
  }

  async getTeamFormStats() {
    // No invented form records: use a real provider before exposing form stats.
    return [];
  }

  async getHeadToHeadRecord() {
    // No invented H2H records: use a real provider before exposing H2H stats.
    return null;
  }

  async getLeagueTable() {
    return table;
  }

  async getTeamSummary(teamName) {
    const normalized = String(teamName).toLowerCase();
    const summaryByTeam = {
      arsenal: 'Arsenal are on a strong run with high pressing and efficient transitions.',
      liverpool: 'Liverpool are creating chances through fast wing play and aggressive midfield control.',
      chelsea: 'Chelsea are finding rhythm through patient build-up and vertical passing.',
      barcelona: 'Barcelona are dominating possession and attacking through the half-spaces.',
      'real madrid': 'Real Madrid remain dangerous on counters with elite finishing in the final third.',
      'manchester city': 'Manchester City are controlled and dynamic, especially with ball progression through midfield.'
    };

    const match = Object.entries(summaryByTeam).find(([team]) => team === normalized);
    return match ? match[1] : null;
  }
}

export const mockSportsProvider = new MockSportsProvider();
export default MockSportsProvider;
