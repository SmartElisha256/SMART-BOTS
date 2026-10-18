import { getPlayerAvailability } from './availabilityService.js';
import { getLineupContext } from './lineupService.js';
import { getTeamStrength } from './teamStrengthService.js';
import { summarizeTacticalContext } from './tacticalAnalysisService.js';
import { assessDataQuality } from './dataQualityService.js';

export async function getMatchContext(homeTeam, awayTeam, options = {}) {
  const [homeAvailability, awayAvailability, lineups, homeStrength, awayStrength] = await Promise.all([
    getPlayerAvailability(homeTeam).catch((error) => ({ team: homeTeam, status: 'error', injuries: [], note: error.message })),
    getPlayerAvailability(awayTeam).catch((error) => ({ team: awayTeam, status: 'error', injuries: [], note: error.message })),
    getLineupContext(homeTeam, awayTeam).catch((error) => ({ status: 'error', note: error.message })),
    getTeamStrength(homeTeam, options).catch((error) => ({ team: homeTeam, status: 'error', note: error.message })),
    getTeamStrength(awayTeam, options).catch((error) => ({ team: awayTeam, status: 'error', note: error.message }))
  ]);
  const availability = { home: homeAvailability, away: awayAvailability };
  const tactical = summarizeTacticalContext(lineups, homeStrength, awayStrength);
  const dataQuality = assessDataQuality({ homeAvailability, awayAvailability, lineups, homeStrength, awayStrength });
  return { availability, lineups, teamStrength: { home: homeStrength, away: awayStrength }, tactical, dataQuality };
}

export function formatMatchContext(context) {
  const lines = ['PRE-MATCH SQUAD & TEAM CONTEXT'];
  for (const side of ['home', 'away']) {
    const item = context.availability?.[side];
    lines.push(`\n${side.toUpperCase()} TEAM — ${item?.team ?? 'Unknown'}`);
    if (item?.injuries?.length) {
      lines.push(...item.injuries.slice(0, 12).map((p) => `• ${p.player}: ${[p.type, p.reason].filter(Boolean).join(' — ') || 'listed unavailable'}`));
    } else lines.push(`• Availability: ${item?.note || 'No confirmed records available; do not assume full squad availability.'}`);
  }
  const lineup = context.lineups;
  lines.push('\nLINEUPS / FORMATIONS');
  if (lineup?.status === 'available') {
    for (const team of lineup.teams) lines.push(`• ${team.team}: ${team.formation || 'formation not supplied'}; ${team.startXI.length} starters listed; ${team.substitutes.length} substitutes listed`);
  } else lines.push(`• ${lineup?.note || 'Not available yet.'}`);
  lines.push('\nTEAM STRENGTH (season statistics)');
  for (const side of ['home', 'away']) {
    const t = context.teamStrength?.[side];
    lines.push(t?.status === 'available'
      ? `• ${t.team}: form ${t.form || 'not supplied'}; W-D-L ${t.wins ?? '?'}-${t.draws ?? '?'}-${t.losses ?? '?'}; goals scored avg ${t.goalsFor?.average ?? '?'}; conceded avg ${t.goalsAgainst?.average ?? '?'}; clean sheets ${t.cleanSheets ?? '?'}`
      : `• ${t?.team || side}: ${t?.note || 'season statistics unavailable'}`);
  }
  lines.push('\nDATA QUALITY');
  lines.push(`• Status: ${context.dataQuality?.status || 'unknown'}`);
  if (context.dataQuality?.warnings?.length) lines.push(...context.dataQuality.warnings.slice(0, 6).map((warning) => `• Warning: ${warning}`));
  lines.push('\nNote: injury lists can be incomplete, lineups may not be published yet, and these statistics do not establish certainty about a match.');
  return lines.join('\n');
}
