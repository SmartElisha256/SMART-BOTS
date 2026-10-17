const STALE_AFTER_HOURS = 48;

export function assessDataQuality(sections = {}, now = Date.now()) {
  const warnings = [];
  const sources = new Set();
  for (const [name, value] of Object.entries(sections)) {
    if (!value) { warnings.push(`${name}: unavailable`); continue; }
    if (value.source) sources.add(value.source);
    if (value.status === 'no-records' || value.status === 'pending-or-unavailable' || value.status === 'not-found' || value.status === 'unavailable') {
      warnings.push(`${name}: ${value.note || value.status}`);
    }
    const date = value.updatedAt || value.timestamp || value.asOf;
    if (date && Number.isFinite(Date.parse(date)) && now - Date.parse(date) > STALE_AFTER_HOURS * 3600000) {
      warnings.push(`${name}: data may be stale (older than 48 hours)`);
    }
  }
  if (!sources.size) warnings.push('No verified provider source was identified.');
  return { status: warnings.length ? 'partial' : 'available', sources: [...sources], warnings };
}
