const dedupeMap = new Map();

/**
 * In-process message-ID deduplication for WhatsApp webhook retries.
 * Meta can redeliver the same message; skip processing when the ID was
 * seen recently. For multi-instance deploys, prefer a shared Redis key.
 */
export function isDuplicateMessage(identifier, ttlMs = 15 * 60 * 1000) {
  if (!identifier) return false;

  const key = String(identifier);
  const now = Date.now();
  const previous = dedupeMap.get(key);

  if (previous && now - previous < ttlMs) {
    return true;
  }

  dedupeMap.set(key, now);

  // Opportunistic cleanup to avoid unbounded growth.
  if (dedupeMap.size > 5000) {
    for (const [id, seenAt] of dedupeMap) {
      if (now - seenAt >= ttlMs) dedupeMap.delete(id);
    }
  }

  return false;
}

export function clearDeduplicationCache() {
  dedupeMap.clear();
}
