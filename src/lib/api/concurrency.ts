/**
 * Best-effort per-instance concurrency limiter. A shared store (Redis) is not
 * available in this deployment, so the cap is enforced per app instance; in a
 * multi-instance deployment the effective limit is `limit * instanceCount`.
 * Documented in docs/api/rate-limits.md.
 */
const active = new Map<string, number>();

export function acquireConcurrencySlot(key: string, limit: number, now = Date.now()): { allowed: boolean } {
  const current = active.get(key) ?? 0;
  if (current >= limit) return { allowed: false };
  active.set(key, current + 1);
  return { allowed: true };
}

export function releaseConcurrencySlot(key: string) {
  const current = active.get(key) ?? 0;
  if (current <= 1) active.delete(key);
  else active.set(key, current - 1);
}

export function activeCount(key: string) {
  return active.get(key) ?? 0;
}

/** Test helper. */
export function resetConcurrency() {
  active.clear();
}
