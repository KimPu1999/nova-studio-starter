import { prisma } from '../prisma';

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number };

function windowStart(windowMs: number, now = Date.now()) {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

function monthlyWindowStart(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function retryAfter(windowMs: number, now = Date.now()) {
  return Math.max(1, Math.ceil((windowStart(windowMs, now).getTime() + windowMs - now) / 1000));
}

function monthEnd(now = Date.now()) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

/**
 * Atomic fixed-window counter backed by Postgres. Safe across app instances:
 * the increment happens inside the INSERT ... ON CONFLICT DO UPDATE statement.
 */
export async function rateLimitCheck(key: string, limit: number, windowMs: number, now = Date.now()): Promise<RateLimitResult> {
  const start = windowStart(windowMs, now);
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `INSERT INTO "ApiRateCounter" (id, scope, key, "windowStart", count, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 1, now(), now())
     ON CONFLICT (scope, key, "windowStart") DO UPDATE SET count = "ApiRateCounter".count + 1, "updatedAt" = now()
     RETURNING count`,
    'rate',
    key,
    start,
  );
  const count = Number(rows[0]?.count ?? 0);
  if (count <= limit) return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
  return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter(windowMs, now) };
}

/**
 * Calendar-month quota counter. Uses the same atomic mechanism but with a
 * monthly window so credentials cannot bypass the quota by rotating keys —
 * the counter key is scoped to the workspace/user, not the credential.
 */
export async function monthlyQuotaCheck(key: string, limit: number, now = Date.now()): Promise<RateLimitResult> {
  const start = monthlyWindowStart(now);
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `INSERT INTO "ApiRateCounter" (id, scope, key, "windowStart", count, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 1, now(), now())
     ON CONFLICT (scope, key, "windowStart") DO UPDATE SET count = "ApiRateCounter".count + 1, "updatedAt" = now()
     RETURNING count`,
    'quota',
    key,
    start,
  );
  const count = Number(rows[0]?.count ?? 0);
  if (count <= limit) return { allowed: true, remaining: Math.max(0, limit - count), retryAfterSeconds: 0 };
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((monthEnd(now).getTime() - now) / 1000)) };
}

/** Peek at a window without consuming a request (for dashboards). */
export async function rateLimitPeek(scope: string, key: string, start: Date): Promise<number> {
  const row = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT count FROM "ApiRateCounter" WHERE scope = $1 AND key = $2 AND "windowStart" = $3`,
    scope,
    key,
    start,
  );
  return Number(row[0]?.count ?? 0);
}
