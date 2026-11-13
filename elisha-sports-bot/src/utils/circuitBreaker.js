/**
 * Lightweight in-process circuit breaker.
 * Opens after consecutive failures; half-opens after resetMs.
 */
export function createCircuitBreaker({
  name = 'circuit',
  failureThreshold = 5,
  resetMs = 60_000,
  logger = console
} = {}) {
  let failures = 0;
  let openedAt = 0;
  let state = 'closed'; // closed | open | half-open

  function isOpen() {
    if (state !== 'open') return false;
    if (Date.now() - openedAt >= resetMs) {
      state = 'half-open';
      return false;
    }
    return true;
  }

  function recordSuccess() {
    failures = 0;
    state = 'closed';
  }

  function recordFailure(error) {
    failures += 1;
    if (failures >= failureThreshold) {
      state = 'open';
      openedAt = Date.now();
      logger.warn?.(
        { name, failures, error: error?.message },
        'Circuit breaker opened'
      );
    }
  }

  async function exec(fn) {
    if (isOpen()) {
      const err = new Error(`${name} circuit is open; try again shortly.`);
      err.code = 'CIRCUIT_OPEN';
      throw err;
    }
    try {
      const result = await fn();
      recordSuccess();
      return result;
    } catch (error) {
      recordFailure(error);
      throw error;
    }
  }

  return {
    exec,
    recordSuccess,
    recordFailure,
    getState: () => ({ name, state, failures, openedAt })
  };
}
