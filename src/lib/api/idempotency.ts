import { prisma } from '../prisma';
import { hashCredential } from '../security/secrets';

export type IdempotencyOutcome<T> =
  | { kind: 'PROCEED'; release: () => void; complete: (statusCode: number, response: T) => Promise<void>; fail: () => Promise<void> }
  | { kind: 'REPLAY'; statusCode: number; response: T }
  | { kind: 'CONFLICT'; message: string }
  | { kind: 'LOCKED'; message: string };

const RETENTION_HOURS = 24;
const IN_FLIGHT_GRACE_MS = 5 * 60_000;

/**
 * Idempotent mutation guard scoped to (principal, operation, key) and bound to
 * the request payload hash. Backed by a unique constraint, so concurrent
 * requests with the same key cannot both perform the mutation.
 *
 * Usage:
 *   const guard = await beginIdempotentOperation(key, op, principalKey, payloadHash);
 *   if (guard.kind === 'REPLAY') return storedResponse;
 *   if (guard.kind === 'CONFLICT' || guard.kind === 'LOCKED') return 409;
 *   try { ...perform mutation...; await guard.complete(201, body); }
 *   catch (e) { await guard.fail(); throw e; }
 *   finally { guard.release(); }
 */
export async function beginIdempotentOperation<T>(
  principalKey: string,
  operation: string,
  idempotencyKey: string,
  payloadHash: string,
  now = Date.now(),
): Promise<IdempotencyOutcome<T>> {
  const scopedKey = hashCredential(`${principalKey}:${operation}:${idempotencyKey}`);
  const expiresAt = new Date(now + RETENTION_HOURS * 3600_000);

  try {
    const created = await prisma.apiIdempotencyRecord.create({
      data: { principalKey: scopedKey, operation, idempotencyKey, payloadHash, statusCode: 0, response: {}, expiresAt },
    });
    let finished = false;
    return {
      kind: 'PROCEED',
      release: () => { finished = true; },
      complete: async (statusCode: number, response: T) => {
        if (finished) return;
        finished = true;
        await prisma.apiIdempotencyRecord.update({ where: { id: created.id }, data: { statusCode, response: response as object } }).catch(() => undefined);
      },
      fail: async () => {
        if (finished) return;
        finished = true;
        // Release the lock so a client can safely retry after a server error.
        await prisma.apiIdempotencyRecord.delete({ where: { id: created.id } }).catch(() => undefined);
      },
    };
  } catch {
    // Unique violation: an attempt with this key already exists.
    const existing = await prisma.apiIdempotencyRecord.findUnique({
      where: { principalKey_operation_idempotencyKey: { principalKey: scopedKey, operation, idempotencyKey } },
    });
    if (!existing) return { kind: 'CONFLICT', message: 'Idempotency key could not be reserved.' };

    if (existing.payloadHash !== payloadHash) {
      return { kind: 'CONFLICT', message: 'This idempotency key was already used with a different request payload.' };
    }
    if (existing.expiresAt <= new Date(now)) {
      // Expired: replace it and proceed.
      await prisma.apiIdempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined);
      const retry = await beginIdempotentOperation<T>(principalKey, operation, idempotencyKey, payloadHash, now);
      return retry;
    }
    if (existing.statusCode === 0) {
      if (now - existing.createdAt.getTime() > IN_FLIGHT_GRACE_MS) {
        // A crashed request never completed; reclaim the slot.
        await prisma.apiIdempotencyRecord.delete({ where: { id: existing.id } }).catch(() => undefined);
        return beginIdempotentOperation<T>(principalKey, operation, idempotencyKey, payloadHash, now);
      }
      return { kind: 'LOCKED', message: 'An identical request is currently in progress. Retry shortly.' };
    }
    return { kind: 'REPLAY', statusCode: existing.statusCode, response: existing.response as T };
  }
}

/** Reads the Idempotency-Key header (validated shape) or null. */
export function idempotencyKeyFrom(request: Request) {
  const key = request.headers.get('idempotency-key');
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 255) return null;
  return /^[A-Za-z0-9._-]+$/.test(trimmed) ? trimmed : null;
}
