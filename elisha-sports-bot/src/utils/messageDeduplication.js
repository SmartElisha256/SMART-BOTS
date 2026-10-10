const dedupeMap = new Map();

export function isDuplicateMessage(identifier, ttlMs = 60000) {
  const now = Date.now();
  const previous = dedupeMap.get(identifier);

  if (previous && now - previous < ttlMs) {
    return true;
  }

  dedupeMap.set(identifier, now);
  return false;
}

export function clearDeduplicationCache() {
  dedupeMap.clear();
}
