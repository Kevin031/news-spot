export function createCircuitBreaker({ failureThreshold = 3, cooldownMs = 300_000 } = {}) {
  const states = new Map();
  function state(sourceId) {
    if (!states.has(sourceId)) states.set(sourceId, { failures: 0, openedAt: null, probing: false });
    return states.get(sourceId);
  }
  return {
    canRequest(sourceId, now = Date.now()) {
      const current = state(sourceId);
      if (current.openedAt == null) return true;
      if (now - current.openedAt < cooldownMs || current.probing) return false;
      current.probing = true;
      return true;
    },
    success(sourceId) {
      states.set(sourceId, { failures: 0, openedAt: null, probing: false });
    },
    failure(sourceId, now = Date.now()) {
      const current = state(sourceId);
      current.failures += 1;
      current.probing = false;
      if (current.failures >= failureThreshold) current.openedAt = now;
    },
    status(sourceId) {
      const current = state(sourceId);
      return current.openedAt == null ? "closed" : "open";
    },
  };
}
