/**
 * Map common league names / abbreviations to a canonical label
 * understood by the sports provider (API-Football search or default EPL).
 */
const ALIASES = new Map([
  ['epl', 'Premier League'],
  ['premier', 'Premier League'],
  ['premier league', 'Premier League'],
  ['english premier league', 'Premier League'],
  ['pl', 'Premier League'],
  ['la liga', 'La Liga'],
  ['laliga', 'La Liga'],
  ['spain', 'La Liga'],
  ['serie a', 'Serie A'],
  ['seriea', 'Serie A'],
  ['italy', 'Serie A'],
  ['bundesliga', 'Bundesliga'],
  ['germany', 'Bundesliga'],
  ['ligue 1', 'Ligue 1'],
  ['ligue1', 'Ligue 1'],
  ['france', 'Ligue 1'],
  ['champions league', 'UEFA Champions League'],
  ['ucl', 'UEFA Champions League'],
  ['cl', 'UEFA Champions League'],
  ['europa league', 'UEFA Europa League'],
  ['uel', 'UEFA Europa League'],
  ['conference league', 'UEFA Europa Conference League'],
  ['mls', 'Major League Soccer'],
  ['saudi', 'Saudi Pro League'],
  ['spl', 'Saudi Pro League'],
  ['uganda', 'Uganda Premier League'],
  ['upl', 'Uganda Premier League'],
  ['afcon', 'Africa Cup of Nations'],
  ['caf', 'CAF Champions League']
]);

export function normalizeLeagueName(input, fallback = 'Premier League') {
  const raw = String(input ?? '').trim();
  if (!raw) return fallback;
  const key = raw.toLowerCase().replace(/\s+/g, ' ');
  if (ALIASES.has(key)) return ALIASES.get(key);
  // Partial match on known aliases
  for (const [alias, canonical] of ALIASES) {
    if (key.includes(alias) || alias.includes(key)) return canonical;
  }
  // Title-case unknown leagues so provider search still works
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function listSupportedLeagueAliases() {
  const unique = [...new Set(ALIASES.values())];
  return unique.sort();
}
