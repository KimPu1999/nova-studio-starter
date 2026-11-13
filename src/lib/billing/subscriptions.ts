/**
 * Phase 18 — subscription lifecycle.
 *
 * State machine (see SUBSCRIPTION_TRANSITIONS in constants.ts):
 *   INCOMPLETE -> PENDING_PAYMENT -> ACTIVE -> PAST_DUE -> GRACE_PERIOD ->
 *   SUSPENDED -> (reactivation with verified payment) ACTIVE, and terminal
 *   CANCELLED/EXPIRED.
 *
 * Hard rules enforced here:
 * - A subscription is NEVER activated, renewed, or reactivated from a payment
 *   that is not verified (manual verification happens in payments.ts).
 * - Only one non-terminal subscription may exist per (account, scope): the
 *   `slotKey` unique constraint reserves the scope while any status in
 *   SLOT_HOLDING_STATUSES holds it, and is released on cancel/expire.
 * - Renewals are idempotent: `lastRenewalKey` plus unique invoice idempotency
 *   keys guarantee one renewal invoice per (subscription, period).
 * - Plan changes never silently activate: they create an adjustment invoice
 *   that flows through manual payment verification.
 */
import { prisma } from '@/lib/prisma';
import { SUBSCRIPTION_TRANSITIONS, SLOT_HOLDING_STATUSES, TERMINAL_SUBSCRIPTION_STATUSES, billingScopeKey, advancePeriod, assertIntMmk, monthlyNormalizedMmk, FEATURE_KEYS } from './constants';
import { getActivePlanVersion, resolvePlanChange } from './plans';
import { syncEntitlementsForSubscription, disableEntitlements, invalidateEntitlementCache } from './entitlements';
import { createInvoice, issueInvoice, postInvoiceSettlementLedger } from './invoices';
import { billingAudit, billingNotify } from './audit';
import type { BillingCycle, BillingScopeType, BillingSubscription, BillingSubscriptionStatus, Prisma, User } from '@prisma/client';

export type SubscriptionClient = Prisma.TransactionClient;

export function assertTransition(from: BillingSubscriptionStatus, to: BillingSubscriptionStatus): void {
  if (!SUBSCRIPTION_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid subscription transition: ${from} -> ${to}`);
  }
}

function slotFor(scopeKey: string): string {
  return `SLOT:${scopeKey}`;
}

export interface CreateSubscriptionInput {
  accountId: string;
  scopeType: BillingScopeType;
  scopeId: string;
  planId: string;
  cycle: BillingCycle;
  startsAt?: Date;
  actorId?: string;
}

/**
 * Creates (or returns the existing) PENDING_PAYMENT subscription for a scope.
 * Free plans are activated immediately without payment. Idempotent: the same
 * scope always resolves to the same subscription.
 */
export async function createSubscription(input: CreateSubscriptionInput): Promise<BillingSubscription> {
  const scopeKey = billingScopeKey(input.scopeType, input.scopeId);
  const planVersion = await getActivePlanVersion(input.planId);
  if (!planVersion) throw new Error('Plan has no active version.');
  const priceMmk = input.cycle === 'ANNUAL' ? planVersion.annualPriceMmk : planVersion.monthlyPriceMmk;
  assertIntMmk(priceMmk, 'Subscription price');
  const idempotencyKey = `sub:${scopeKey}:${input.planId}:${input.cycle}`;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.billingSubscription.findFirst({
      where: { accountId: input.accountId, scopeType: input.scopeType, scopeKey, slotKey: slotFor(scopeKey) },
      include: { items: true, planVersion: true, plan: true },
    });
    if (existing) return existing;
    const startsAt = input.startsAt ?? new Date();
    const created = await tx.billingSubscription.create({
      data: {
        accountId: input.accountId,
        scopeType: input.scopeType,
        scopeKey,
        slotKey: slotFor(scopeKey),
        planId: input.planId,
        planVersionId: planVersion.id,
        cycle: input.cycle,
        status: 'PENDING_PAYMENT',
        currency: 'MMK',
        priceMmk,
        startsAt,
        idempotencyKey,
        items: {
          create: [{ itemType: 'PLAN_BASE', description: 'Plan subscription', quantity: 1, unitAmountMmk: priceMmk, amountMmk: priceMmk }],
        },
      },
    });
    // Free plans skip payment entirely: activate immediately within the same transaction.
    let subscription = created;
    if (priceMmk === 0) {
      const periodEnd = advancePeriod(startsAt, input.cycle);
      subscription = await tx.billingSubscription.update({
        where: { id: created.id },
        data: { status: 'ACTIVE', currentPeriodStart: startsAt, currentPeriodEnd: periodEnd, renewsAt: periodEnd, lastRenewalKey: `free-initial:${created.id}` },
        include: { items: true, planVersion: true, plan: true },
      });
      await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: 'ACTIVE', planVersion });
    }
    await billingAudit({ actorId: input.actorId, accountId: input.accountId, entityType: 'BillingSubscription', entityId: subscription.id, action: priceMmk === 0 ? 'CREATE_FREE' : 'CREATE', after: { planId: input.planId, cycle: input.cycle, status: subscription.status } });
    return subscription;
  });
  if (result.status === 'ACTIVE') invalidateEntitlementCache(result.accountId);
  return result;
}
/** The first invoice for a pending subscription (idempotent per period). */
export async function createSubscriptionInvoice(subscriptionId: string, actorId?: string) {
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: subscriptionId }, include: { planVersion: true, plan: true, account: true } });
  if (!subscription) throw new Error('Subscription not found.');
  if (subscription.priceMmk === 0) return null;
  const periodStart = subscription.startsAt ?? new Date();
  const periodEnd = advancePeriod(periodStart, subscription.cycle);
  const idempotencyKey = `invoice:initial:${subscription.id}:${periodStart.toISOString().slice(0, 10)}`;
  const invoice = await createInvoice({
    accountId: subscription.accountId,
    subscriptionId: subscription.id,
    purpose: 'SUBSCRIPTION',
    periodStart,
    periodEnd,
    dueAt: new Date(periodEnd.getTime() - 3 * 86_400_000),
    idempotencyKey,
    actorId,
    lines: [{ lineType: 'SUBSCRIPTION_PLAN' as const, description: `${subscription.plan.name} · ${subscription.cycle === 'ANNUAL' ? 'Annual' : 'Monthly'} · v${subscription.planVersion.version}`, quantity: 1, unitAmountMmk: subscription.priceMmk, planVersionId: subscription.planVersionId }],
  });
  if (invoice.status === 'DRAFT') await issueInvoice(invoice.id, actorId);
  return invoice;
}

/** Creates the first invoice and returns both, for new paid subscriptions. */
export async function startSubscription(input: CreateSubscriptionInput) {
  const subscription = await createSubscription(input);
  const invoice = await createSubscriptionInvoice(subscription.id, input.actorId);
  return { subscription, invoice };
}

/**
 * Activates a subscription from a VERIFIED payment (called only by the payment
 * reviewer inside the same transaction). Idempotent: an already-ACTIVE
 * subscription with the same renewal key is left untouched.
 */
export async function activateSubscriptionFromVerifiedPayment(
  tx: SubscriptionClient,
  subscriptionId: string,
  invoice: { idempotencyKey: string; periodStart: Date | null; periodEnd: Date | null; amountPaidMmk: number },
  actorId?: string,
): Promise<BillingSubscription> {
  const subscription = await tx.billingSubscription.findUnique({ where: { id: subscriptionId }, include: { planVersion: true, plan: true } });
  if (!subscription) throw new Error('Subscription not found.');
  if (TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status)) {
    throw new Error('A cancelled or expired subscription cannot be re-activated; create a new subscription.');
  }
  const renewalKey = invoice.idempotencyKey;
  if (subscription.status === 'ACTIVE' && subscription.lastRenewalKey === renewalKey) return subscription;
  const periodStart = invoice.periodStart ?? subscription.currentPeriodStart ?? new Date();
  const periodEnd = invoice.periodEnd ?? advancePeriod(periodStart, subscription.cycle);
  assertTransition(subscription.status, 'ACTIVE');
  await syncEntitlementsForSubscription(tx, {
    id: subscription.id,
    accountId: subscription.accountId,
    scopeType: subscription.scopeType,
    scopeKey: subscription.scopeKey,
    status: 'ACTIVE',
    planVersion: subscription.planVersion,
  });
  invalidateEntitlementCache(subscription.accountId);
  const updated = await tx.billingSubscription.update({
    where: { id: subscription.id },
    data: {
      status: 'ACTIVE',
      priceMmk: subscription.priceMmk,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      renewsAt: periodEnd,
      graceUntil: null,
      lastRenewalKey: renewalKey,
    },
  });
  await billingAudit({ actorId, accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscription.id, action: 'ACTIVATE', before: { status: subscription.status }, after: { status: 'ACTIVE', periodStart, periodEnd } });
  return updated;
}

/** Applies a verified renewal: advances the period and clears grace status. */
export async function renewSubscriptionFromVerifiedPayment(
  tx: SubscriptionClient,
  subscriptionId: string,
  invoice: { idempotencyKey: string; periodStart: Date | null; periodEnd: Date | null },
  actorId?: string,
): Promise<BillingSubscription> {
  const subscription = await tx.billingSubscription.findUnique({ where: { id: subscriptionId }, include: { planVersion: true, plan: true } });
  if (!subscription) throw new Error('Subscription not found.');
  if (subscription.lastRenewalKey === invoice.idempotencyKey) return subscription; // idempotent replay
  return activateSubscriptionFromVerifiedPayment(tx, subscriptionId, { ...invoice, amountPaidMmk: subscription.priceMmk }, actorId);
}

/**
 * Requests a plan change: validates the transition, creates a prorated
 * ADJUSTMENT invoice for the remainder of the current period (no automatic
 * charging — the invoice flows through manual payment verification), and
 * queues the plan swap. Entitlements keep the CURRENT plan until payment is
 * verified; the swap is applied by the verifier.
 */
export async function requestPlanChange(subscriptionId: string, targetPlanId: string, actor: User) {
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: subscriptionId }, include: { planVersion: true, plan: true, account: true } });
  if (!subscription) throw new Error('Subscription not found.');
  if (!['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'].includes(subscription.status)) {
    throw new Error('Plan changes require an active, past-due, or grace-period subscription.');
  }
  const { target, targetVersion } = await resolvePlanChange(subscription.planVersionId, targetPlanId);
  const targetPrice = subscription.cycle === 'ANNUAL' ? targetVersion.annualPriceMmk : targetVersion.monthlyPriceMmk;
  const now = new Date();
  const periodEnd = subscription.currentPeriodEnd ?? advancePeriod(subscription.startsAt ?? now, subscription.cycle);
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  const periodMs = periodEnd.getTime() - (subscription.currentPeriodStart?.getTime() ?? (subscription.startsAt?.getTime() ?? now.getTime()));
  const currentMonthly = monthlyNormalizedMmk(subscription.priceMmk, subscription.cycle);
  const targetMonthly = monthlyNormalizedMmk(targetPrice, subscription.cycle);
  const delta = Math.round((targetMonthly - currentMonthly) * (remainingMs / Math.max(periodMs, 1)));
  const proratedDeltaMmk = Math.max(0, delta); // Downgrades: no automatic refund; credit handled via credit note request.
  const idempotencyKey = `planchange:${subscription.id}:${targetPlanId}:${periodEnd.toISOString().slice(0, 10)}`;
  const invoice = await createInvoice({
    accountId: subscription.accountId,
    subscriptionId: subscription.id,
    purpose: 'PLAN_CHANGE',
    periodStart: now,
    periodEnd,
    dueAt: new Date(now.getTime() + 3 * 86_400_000),
    idempotencyKey,
    actorId: actor.id,
    notes: `Plan change ${subscription.plan.code} -> ${target.code} (applied after payment verification). targetVersionId:${targetVersion.id}`,
    lines: proratedDeltaMmk > 0 ? [{ lineType: 'ADJUSTMENT' as const, description: `Plan change to ${target.name} · prorated remainder of period`, quantity: 1, unitAmountMmk: proratedDeltaMmk }] : [{ lineType: 'ADJUSTMENT' as const, description: `Plan change to ${target.name} · no additional charge`, quantity: 1, unitAmountMmk: 0 }],
  });
  await prisma.billingInvoice.update({ where: { id: invoice.id }, data: { metadata: { targetVersionId: targetVersion.id, targetPlanId: targetPlanId, targetPriceMmk: targetPrice } as never } });
  if (invoice.status === 'DRAFT') await issueInvoice(invoice.id, actor.id);
  await billingAudit({ actorId: actor.id, accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscription.id, action: 'REQUEST_PLAN_CHANGE', after: { targetPlanId, targetVersionId: targetVersion.id, proratedDeltaMmk } });
  return { subscription, target, targetVersion, invoice, proratedDeltaMmk };
}

/**
 * Applies a verified plan change (payment reviewer path). Swaps the plan
 * version and re-syncs entitlements; historical invoices keep their versions.
 */
export async function applyPlanChangeFromVerifiedPayment(
  tx: SubscriptionClient,
  subscriptionId: string,
  targetVersionId: string,
  newPriceMmk: number,
  actorId?: string,
): Promise<BillingSubscription> {
  const subscription = await tx.billingSubscription.findUnique({ where: { id: subscriptionId }, include: { planVersion: true } });
  if (!subscription) throw new Error('Subscription not found.');
  const planVersion = await tx.billingPlanVersion.findUnique({ where: { id: targetVersionId } });
  if (!planVersion) throw new Error('Target plan version not found.');
  const updated = await tx.billingSubscription.update({
    where: { id: subscriptionId },
    data: {
      planVersionId: targetVersionId,
      planId: planVersion.planId,
      priceMmk: newPriceMmk,
      lastRenewalKey: `planchange-applied:${subscriptionId}:${targetVersionId}`,
    },
  });
  await tx.billingSubscriptionItem.upsert({
    where: { subscriptionId_itemType: { subscriptionId, itemType: 'PLAN_BASE' } },
    update: { unitAmountMmk: newPriceMmk, amountMmk: newPriceMmk, description: `Plan · v${planVersion.version}` },
    create: { subscriptionId, itemType: 'PLAN_BASE', description: `Plan · v${planVersion.version}`, unitAmountMmk: newPriceMmk, amountMmk: newPriceMmk },
  });
  await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: subscription.status === 'ACTIVE' ? 'ACTIVE' : subscription.status, planVersion });
  invalidateEntitlementCache(subscription.accountId);
  await billingAudit({ actorId, accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscriptionId, action: 'APPLY_PLAN_CHANGE', after: { planVersionId: targetVersionId, priceMmk: newPriceMmk } });
  return updated;
}

/** Requests cancellation at period end (soft); termination happens in the job. */
export async function cancelSubscription(subscriptionId: string, actorId: string, immediate = false) {
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new Error('Subscription not found.');
  if (TERMINAL_SUBSCRIPTION_STATUSES.includes(subscription.status)) return subscription;
  assertTransition(subscription.status, 'CANCELLED');
  const now = new Date();
  if (immediate) {
    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.billingSubscription.update({
        where: { id: subscriptionId },
        data: { status: 'CANCELLED', cancelledAt: now, endedAt: now, cancelAtPeriodEnd: false, slotKey: null },
      });
      await disableEntitlements(subscription.accountId, subscription.scopeType, subscription.scopeKey.replace(/^(USER|WS|SITE):/, ''));
      return s;
    });
    await billingAudit({ actorId, accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscriptionId, action: 'CANCEL_IMMEDIATE', before: { status: subscription.status }, after: { status: 'CANCELLED' } });
    return updated;
  }
  const updated = await prisma.billingSubscription.update({ where: { id: subscriptionId }, data: { cancelAtPeriodEnd: true } });
  await billingAudit({ actorId, accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscriptionId, action: 'CANCEL_AT_PERIOD_END', after: { cancelAtPeriodEnd: true } });
  return updated;
}

/**
 * Lifecycle sweep (durable job helper): expires subscriptions whose period ended
 * with cancelAtPeriodEnd, moves ACTIVE -> PAST_DUE after the period ends, opens
 * GRACE_PERIOD with a deadline, suspends when grace lapses. Customer data is
 * never deleted — entitlements are merely disabled.
 */
export async function runSubscriptionLifecycleSweep(now: Date = new Date(), graceDays = 7): Promise<{ expired: number; pastDue: number; grace: number; suspended: number }> {
  let expired = 0, pastDue = 0, grace = 0, suspended = 0;
  const activeOrRenewable = await prisma.billingSubscription.findMany({
    where: { status: { in: ['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'] }, currentPeriodEnd: { lt: now } },
    include: { planVersion: true, account: true },
  });
  for (const subscription of activeOrRenewable) {
    if (subscription.cancelAtPeriodEnd) {
      await prisma.$transaction(async (tx) => {
        await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: 'EXPIRED', endedAt: now, slotKey: null } });
        await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: 'EXPIRED', planVersion: subscription.planVersion });
      });
      invalidateEntitlementCache(subscription.accountId);
      await billingAudit({ accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscription.id, action: 'EXPIRED_AT_PERIOD_END' });
      await billingNotify(subscription.account.ownerUserId, 'BILLING_SUBSCRIPTION_ENDED', 'Subscription ended', 'Your subscription ended at the close of its billing period.', '/billing/subscription');
      expired++;
      continue;
    }
    const graceUntil = new Date(now.getTime() + graceDays * 86_400_000);
    if (subscription.status === 'ACTIVE') {
      await prisma.$transaction(async (tx) => {
        await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: 'GRACE_PERIOD', graceUntil } });
        await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: 'GRACE_PERIOD', planVersion: subscription.planVersion });
      });
      invalidateEntitlementCache(subscription.accountId);
      await billingNotify(subscription.account.ownerUserId, 'BILLING_RENEWAL_DUE', 'Renewal payment due', 'Your renewal invoice is awaiting payment. Entitlements continue during the grace period.', '/billing/invoices');
      grace++;
      continue;
    }
    if (subscription.status === 'PAST_DUE') {
      await prisma.billingSubscription.update({ where: { id: subscription.id }, data: { status: 'GRACE_PERIOD', graceUntil } });
      grace++;
    }
  }
  const graceLapsed = await prisma.billingSubscription.findMany({ where: { status: 'GRACE_PERIOD', graceUntil: { lt: now } }, include: { planVersion: true, account: true } });
  for (const subscription of graceLapsed) {
    await prisma.$transaction(async (tx) => {
      await tx.billingSubscription.update({ where: { id: subscription.id }, data: { status: 'SUSPENDED' } });
      await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: 'SUSPENDED', planVersion: subscription.planVersion });
    });
    invalidateEntitlementCache(subscription.accountId);
    await billingAudit({ accountId: subscription.accountId, entityType: 'BillingSubscription', entityId: subscription.id, action: 'SUSPENDED_AFTER_GRACE' });
    await billingNotify(subscription.account.ownerUserId, 'BILLING_SUSPENDED', 'Subscription suspended', 'Payment was not received during the grace period. Your data is preserved; settle the invoice to reactivate.', '/billing/invoices');
    suspended++;
  }
  return { expired, pastDue, grace, suspended };
}

/** Free plans skip payment entirely: auto-advance periods idempotently. */
export async function advanceFreeSubscriptions(now: Date = new Date()): Promise<number> {
  const free = await prisma.billingSubscription.findMany({
    where: { status: 'ACTIVE', priceMmk: 0, renewsAt: { lte: now } },
    include: { planVersion: true, account: true },
  });
  let advanced = 0;
  for (const subscription of free) {
    const key = `free-period:${subscription.id}:${(subscription.currentPeriodStart ?? subscription.startsAt ?? now).toISOString()}`;
    if (subscription.lastRenewalKey === key) continue;
    await prisma.$transaction(async (tx) => {
      const periodStart = subscription.renewsAt ?? now;
      const periodEnd = advancePeriod(periodStart, subscription.cycle);
      await tx.billingSubscription.update({ where: { id: subscription.id }, data: { currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, renewsAt: periodEnd, lastRenewalKey: key } });
      await syncEntitlementsForSubscription(tx, { id: subscription.id, accountId: subscription.accountId, scopeType: subscription.scopeType, scopeKey: subscription.scopeKey, status: 'ACTIVE', planVersion: subscription.planVersion });
    });
    invalidateEntitlementCache(subscription.accountId);
    advanced++;
  }
  return advanced;
}
