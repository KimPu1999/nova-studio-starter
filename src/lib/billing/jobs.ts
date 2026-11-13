/**
 * Phase 18 — billing background jobs.
 *
 * Limitation (documented honestly): this starter has no durable scheduler or
 * queue runner. Jobs below are idempotent and safe to invoke repeatedly; they
 * are exposed via (a) an admin server action, and (b) an authorized HTTP
 * endpoint guarded by BILLING_JOBS_TOKEN for external schedulers (cron, GitHub
 * Actions, Vercel Cron). Renewal invoices use idempotency keys derived from
 * subscription + period, so duplicate runs never create duplicate invoices and
 * unpaid renewals are never marked as paid.
 */
import { prisma } from '@/lib/prisma';
import { advancePeriod, RENEWABLE_STATUSES, GRACE_PERIOD_DAYS, utcMonthPeriod } from './constants';
import { createInvoice, issueInvoice, markOverdueInvoices } from './invoices';
import { runSubscriptionLifecycleSweep, advanceFreeSubscriptions } from './subscriptions';
import { syncExistingUsageRecords } from './usage';
import { billingAudit, billingNotify } from './audit';
import type { User } from '@prisma/client';

export interface RenewalJobResult {
  renewalInvoices: number;
  overdueInvoices: number;
  expired: number;
  graceOpened: number;
  suspended: number;
  freeAdvanced: number;
}

/**
 * Creates renewal invoices for subscriptions whose current period is ending
 * (12 days ahead) or already ended without payment. Idempotent per
 * (subscription, periodStart): the invoice idempotencyKey encodes both.
 */
export async function runRenewalCycle(actorId?: string, now: Date = new Date()): Promise<{ created: number }> {
  const due = await prisma.billingSubscription.findMany({
    where: { status: { in: RENEWABLE_STATUSES }, cancelAtPeriodEnd: false, priceMmk: { gt: 0 } },
    include: { planVersion: true, plan: true, account: true },
  });
  let created = 0;
  for (const subscription of due) {
    const periodStart = subscription.renewsAt ?? subscription.currentPeriodEnd;
    if (!periodStart) continue;
    const windowEnd = new Date(now.getTime() + 12 * 86_400_000);
    if (periodStart > windowEnd) continue;
    const periodEnd = advancePeriod(periodStart, subscription.cycle);
    const idempotencyKey = `renewal:${subscription.id}:${periodStart.toISOString().slice(0, 10)}`;
    const existing = await prisma.billingInvoice.findUnique({ where: { idempotencyKey } });
    if (existing) continue;
    const invoice = await createInvoice({
      accountId: subscription.accountId,
      subscriptionId: subscription.id,
      purpose: 'SUBSCRIPTION',
      periodStart,
      periodEnd,
      dueAt: new Date(periodStart.getTime() + GRACE_PERIOD_DAYS * 86_400_000),
      idempotencyKey,
      actorId,
      notes: `Renewal for ${subscription.plan.name} · ${subscription.cycle === 'ANNUAL' ? 'annual' : 'monthly'}`,
      lines: [{ lineType: 'SUBSCRIPTION_PLAN', description: `${subscription.plan.name} renewal · ${subscription.cycle === 'ANNUAL' ? 'Annual' : 'Monthly'} · v${subscription.planVersion.version}`, quantity: 1, unitAmountMmk: subscription.priceMmk, planVersionId: subscription.planVersionId }],
    });
    if (invoice.status === 'DRAFT') {
      await issueInvoice(invoice.id, actorId);
      created++;
      await billingNotify(subscription.account.ownerUserId, 'BILLING_RENEWAL_INVOICE', 'Renewal invoice ready', `${subscription.plan.name} renews on ${periodEnd.toISOString().slice(0, 10)}. Pay ${subscription.priceMmk.toLocaleString()} MMK to keep entitlements active.`, `/billing/invoices/${invoice.id}`);
      await billingAudit({ actorId, accountId: subscription.accountId, entityType: 'BillingInvoice', entityId: invoice.id, action: 'CREATE_RENEWAL_INVOICE', after: { subscriptionId: subscription.id, periodStart, periodEnd } });
    }
  }
  return { created };
}

/** Full billing sweep: renewal invoices -> overdue marks -> lifecycle -> usage sync. */
export async function runBillingSweep(actor?: User): Promise<RenewalJobResult> {
  const actorId = actor?.id;
  const renewals = await runRenewalCycle(actorId);
  const overdueInvoices = await markOverdueInvoices();
  const lifecycle = await runSubscriptionLifecycleSweep(new Date(), GRACE_PERIOD_DAYS);
  const freeAdvanced = await advanceFreeSubscriptions();
  await syncExistingUsageRecords({ limit: 200 });
  await billingAudit({ actorId, entityType: 'BillingJob', action: 'RUN_BILLING_SWEEP', after: { ...renewals, overdueInvoices, ...lifecycle, freeAdvanced } });
  return { renewalInvoices: renewals.created, overdueInvoices, expired: lifecycle.expired, graceOpened: lifecycle.grace, suspended: lifecycle.suspended, freeAdvanced };
}

/** Reports the current default reporting period (UTC month). */
export function currentReportingPeriod() {
  return utcMonthPeriod();
}
