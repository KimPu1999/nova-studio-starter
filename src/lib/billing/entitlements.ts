/**
 * Phase 18 — billing entitlements.
 *
 * Entitlements are DERIVED from verified subscription state only. They are
 * synced transactionally whenever a subscription activates, renews, lapses into
 * grace, is suspended, or ends. Consumers (UI, hosting, API, credits) must read
 * limits through this module — never re-derive plan limits inline — so access
 * control logic exists in exactly one place.
 *
 * Caching: a short in-process cache (60s TTL) keyed by account+scope, explicitly
 * invalidated on every sync, keeps hot paths cheap without risking stale
 * entitlement escalation.
 */
import { prisma } from '@/lib/prisma';
import { FEATURE_KEYS, KNOWN_FEATURE_FLAGS, billingScopeKey, SLOT_HOLDING_STATUSES, TERMINAL_SUBSCRIPTION_STATUSES } from './constants';
import type { BillingEntitlement, BillingScopeType, BillingSubscription, BillingSubscriptionStatus } from '@prisma/client';

export interface ResolvedEntitlements {
  seatLimit: number | null;
  websitesLimit: number | null;
  customDomainsLimit: number | null;
  storageMb: number | null;
  bandwidthMb: number | null;
  monthlyAiCredits: number;
  monthlyApiRequests: number | null;
  features: Record<string, boolean>;
  status: BillingSubscriptionStatus | null;
  planCode: string | null;
  planVersion: number | null;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ResolvedEntitlements }>();

export function invalidateEntitlementCache(accountId: string, scopeKey?: string): void {
  for (const key of cache.keys()) {
    if (!scopeKey || key.startsWith(`${accountId}:${scopeKey}:`)) cache.delete(key);
  }
}

/** Features considered granted only while the subscription is in good standing. */
function standingGranted(status: BillingSubscriptionStatus | null): boolean {
  if (!status) return false;
  return status === 'ACTIVE' || status === 'PAST_DUE' || status === 'GRACE_PERIOD';
}

/**
 * Syncs entitlement rows for a subscription scope inside a transaction.
 * Called on activation/renewal (good standing), grace, suspension and end.
 * Rows are upserted, never deleted, so history and audit stay intact; the
 * `enabled` flag governs current access.
 */
export async function syncEntitlementsForSubscription(
  tx: { billingEntitlement: { upsert: Function } },
  subscription: Pick<BillingSubscription, 'id' | 'accountId' | 'scopeType' | 'scopeKey' | 'status'> & { planVersion: {
    includedSeats: number; maxSeats: number | null; websitesLimit: number | null; customDomainsLimit: number | null;
    storageMb: number | null; bandwidthMb: number | null; monthlyAiCredits: number; monthlyApiRequests: number | null; features: string[];
  } },
): Promise<void> {
  const scopeKey = billingScopeKey(subscription.scopeType, subscription.scopeKey.replace(/^(USER|WS|SITE):/, ''));
  const enabled = standingGranted(subscription.status);
  const planVersion = subscription.planVersion;
  const intRows: Array<[string, number | null]> = [
    [FEATURE_KEYS.SEATS_INCLUDED, planVersion.includedSeats],
    [FEATURE_KEYS.SEATS_MAX, planVersion.maxSeats],
    [FEATURE_KEYS.WEBSITES_MAX, planVersion.websitesLimit],
    [FEATURE_KEYS.DOMAINS_MAX, planVersion.customDomainsLimit],
    [FEATURE_KEYS.STORAGE_MB, planVersion.storageMb],
    [FEATURE_KEYS.BANDWIDTH_MB, planVersion.bandwidthMb],
    [FEATURE_KEYS.AI_CREDITS_MONTHLY, planVersion.monthlyAiCredits],
    [FEATURE_KEYS.API_REQUESTS_MONTHLY, planVersion.monthlyApiRequests],
  ];
  for (const [featureKey, valueInt] of intRows) {
    await tx.billingEntitlement.upsert({
      where: { accountId_scopeKey_featureKey: { accountId: subscription.accountId, scopeKey, featureKey } },
      update: { valueInt, valueBool: null, enabled, sourceSubscriptionId: subscription.id, syncedAt: new Date() },
      create: { accountId: subscription.accountId, scopeKey, featureKey, valueInt, valueBool: null, enabled, sourceSubscriptionId: subscription.id },
    });
  }
  for (const flag of KNOWN_FEATURE_FLAGS) {
    const granted = enabled && planVersion.features.includes(flag);
    await tx.billingEntitlement.upsert({
      where: { accountId_scopeKey_featureKey: { accountId: subscription.accountId, scopeKey, featureKey: `feature.${flag}` } },
      update: { valueInt: null, valueBool: granted, enabled, sourceSubscriptionId: subscription.id, syncedAt: new Date() },
      create: { accountId: subscription.accountId, scopeKey, featureKey: `feature.${flag}`, valueInt: null, valueBool: granted, enabled, sourceSubscriptionId: subscription.id },
    });
  }
}

/** Disables all entitlements for a scope (suspension/termination) — non-destructive. */
export async function disableEntitlements(accountId: string, scopeType: BillingScopeType, scopeId: string): Promise<void> {
  const scopeKey = billingScopeKey(scopeType, scopeId);
  await prisma.billingEntitlement.updateMany({ where: { accountId, scopeKey }, data: { enabled: false, syncedAt: new Date() } });
  invalidateEntitlementCache(accountId, scopeKey);
}

/** Reads and resolves entitlements for an account scope. */
export async function resolveEntitlements(accountId: string, scopeType: BillingScopeType, scopeId: string): Promise<ResolvedEntitlements> {
  const scopeKey = billingScopeKey(scopeType, scopeId);
  const cacheKey = `${accountId}:${scopeKey}:${scopeType}:${scopeId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const subscription = await prisma.billingSubscription.findFirst({
    where: { accountId, scopeType, scopeKey: `${scopeType === 'PERSONAL' ? `USER:${scopeId}` : scopeType === 'WORKSPACE' ? `WS:${scopeId}` : `SITE:${scopeId}`}` },
    include: { planVersion: true, plan: { select: { code: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const rows = await prisma.billingEntitlement.findMany({ where: { accountId, scopeKey, enabled: true } });
  const intOf = (key: string, fallback: number | null): number | null => rows.find((r) => r.featureKey === key)?.valueInt ?? fallback;
  const features: Record<string, boolean> = {};
  for (const row of rows) {
    if (row.featureKey.startsWith('feature.')) features[row.featureKey.slice('feature.'.length)] = row.valueBool === true;
  }
  const value: ResolvedEntitlements = {
    seatLimit: intOf(FEATURE_KEYS.SEATS_MAX, null),
    websitesLimit: intOf(FEATURE_KEYS.WEBSITES_MAX, null),
    customDomainsLimit: intOf(FEATURE_KEYS.DOMAINS_MAX, null),
    storageMb: intOf(FEATURE_KEYS.STORAGE_MB, null),
    bandwidthMb: intOf(FEATURE_KEYS.BANDWIDTH_MB, null),
    monthlyAiCredits: intOf(FEATURE_KEYS.AI_CREDITS_MONTHLY, 0) ?? 0,
    monthlyApiRequests: intOf(FEATURE_KEYS.API_REQUESTS_MONTHLY, null),
    features,
    status: subscription?.status ?? null,
    planCode: subscription?.plan.code ?? null,
    planVersion: subscription?.planVersion.version ?? null,
  };
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/**
 * Server-side quota guard. `current` is usage already counted for the period;
 * `requested` is the additional amount about to be consumed.
 * null limits mean unlimited. Returns false when the quota would be exceeded.
 */
export function assertWithinQuota(limit: number | null, current: number, requested: number): boolean {
  if (requested < 0) return false;
  if (limit === null) return true;
  return current + requested <= limit;
}

export { FEATURE_KEYS };
export type { BillingEntitlement };
