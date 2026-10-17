export function summarizeTacticalContext(lineups, homeStrength, awayStrength) {
  const warnings = [];
  const teams = Array.isArray(lineups?.teams) ? lineups.teams : [];
  const lineupSummary = teams.map((team) => ({
    team: team.team,
    formation: team.formation || null,
    coach: team.coach || null,
    startersListed: team.startXI?.length ?? 0,
    substitutesListed: team.substitutes?.length ?? 0
  }));
  if (!lineups || lineups.status !== 'available') warnings.push(lineups?.note || 'Confirmed lineup and formation data unavailable.');
  if (!homeStrength || homeStrength.status !== 'available') warnings.push('Home-team season strength statistics unavailable.');
  if (!awayStrength || awayStrength.status !== 'available') warnings.push('Away-team season strength statistics unavailable.');
  return {
    lineups: lineupSummary,
    teamComparison: [homeStrength, awayStrength].filter(Boolean).map((team) => ({
      team: team.team, form: team.form, played: team.played,
      goalsForAverage: team.goalsFor?.average ?? null,
      goalsAgainstAverage: team.goalsAgainst?.average ?? null,
      cleanSheets: team.cleanSheets ?? null,
      failedToScore: team.failedToScore ?? null
    })),
    tacticalClaims: [],
    note: 'No tactical style is inferred without evidence such as event data or reliable scouting data.',
    warnings
  };
}
