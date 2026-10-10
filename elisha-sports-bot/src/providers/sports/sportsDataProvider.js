export class SportsDataProvider {
  async getFixtures() {
    throw new Error('Sports data provider must implement getFixtures()');
  }

  async getLeagueTable() {
    throw new Error('Sports data provider must implement getLeagueTable()');
  }

  async getTeamSummary() {
    throw new Error('Sports data provider must implement getTeamSummary()');
  }
}
