const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

function validFinishedFixture(fixture) {
  const status = String(fixture?.status ?? '').toUpperCase();
  return FINISHED_STATUSES.has(status) && typeof fixture?.home === 'string' && fixture.home.trim() && typeof fixture?.away === 'string' && fixture.away.trim() && fixture?.homeGoals !== null && fixture?.homeGoals !== undefined && fixture?.awayGoals !== null && fixture?.awayGoals !== undefined && Number.isFinite(Number(fixture.homeGoals)) && Number.isFinite(Number(fixture.awayGoals));
}

function emptyTeam(name) {
  return { team: name, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, home: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }, away: { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 } };
}

function addAppearance(team, scored, conceded, venue) {
  team.played += 1; team.goalsFor += scored; team.goalsAgainst += conceded;
  if (scored > conceded) { team.wins += 1; team.points += 3; } else if (scored === conceded) { team.draws += 1; team.points += 1; } else team.losses += 1;
  const split = team[venue]; split.played += 1; split.goalsFor += scored; split.goalsAgainst += conceded;
  if (scored > conceded) split.wins += 1; else if (scored === conceded) split.draws += 1; else split.losses += 1;
}

export function summarizeSeasonFixtures(fixtures = []) {
  const teams = new Map(); let totalGoals = 0; let matches = 0;
  for (const fixture of fixtures.filter(validFinishedFixture)) {
    const homeName = fixture.home.trim(); const awayName = fixture.away.trim();
    if (homeName.toLowerCase() === awayName.toLowerCase()) continue;
    const homeGoals = Number(fixture.homeGoals); const awayGoals = Number(fixture.awayGoals);
    if (!teams.has(homeName)) teams.set(homeName, emptyTeam(homeName));
    if (!teams.has(awayName)) teams.set(awayName, emptyTeam(awayName));
    addAppearance(teams.get(homeName), homeGoals, awayGoals, 'home');
    addAppearance(teams.get(awayName), awayGoals, homeGoals, 'away');
    totalGoals += homeGoals + awayGoals; matches += 1;
  }
  const table = [...teams.values()].map((team) => ({ ...team, goalDifference: team.goalsFor - team.goalsAgainst, goalsPerMatch: team.played ? Number((team.goalsFor / team.played).toFixed(2)) : 0, goalsConcededPerMatch: team.played ? Number((team.goalsAgainst / team.played).toFixed(2)) : 0 })).sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || a.team.localeCompare(b.team));
  return { matches, teams: table.length, totalGoals, averageGoalsPerMatch: matches ? Number((totalGoals / matches).toFixed(2)) : 0, table };
}

export function formatSeasonReport({ league = 'League', season, fixtures = [], limit = 10 } = {}) {
  const summary = summarizeSeasonFixtures(fixtures);
  if (!summary.matches) return `No completed historical match data was returned for ${league} ${season}. Check the league, season, API access, and data provider.`;
  const rows = summary.table.slice(0, Math.max(1, Math.min(Number(limit) || 10, 20))).map((team, index) => `${index + 1}. ${team.team} — ${team.points} pts | ${team.played} MP | ${team.wins}W ${team.draws}D ${team.losses}L | GF ${team.goalsFor} GA ${team.goalsAgainst} GD ${team.goalDifference}\n   Home: ${team.home.wins}W-${team.home.draws}D-${team.home.losses}L; Away: ${team.away.wins}W-${team.away.draws}D-${team.away.losses}L`).join('\n');
  return `📚 HISTORICAL SEASON REPORT\n${league} — ${season}\n\nMatches analyzed: ${summary.matches}\nTeams found: ${summary.teams}\nTotal goals: ${summary.totalGoals}\nAverage goals per match: ${summary.averageGoalsPerMatch}\n\nFINAL TABLE (derived from completed match data)\n${rows}\n\nDescriptive historical statistics only. This report does not predict future match results.`;
}
