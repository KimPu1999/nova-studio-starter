/**
 * Phase 18 — revenue analytics.
 *
 * Methodology (documented in docs/billing/reconciliation.md and reports UI):
 * - Verified cash receipts: CASH_RECEIPT ledger entries (CREDIT) minus REFUND
 *   (DEBIT) postings — unverified payments are excluded by construction.
 * - Net platform revenue: cash receipts minus refunds minus vendor liabilities.
 *   Vendor commission liabilities live in the vendor ledger and are reported
 *   separately, never as platform revenue.
 * - MRR: sum over ACTIVE subscriptions of monthlyNormalizedMmk(price, cycle).
 *   ARR = MRR x 12. Report uses the snapshot at query time.
 * - Outstanding invoices: (total - amountPaid) over ISSUED/PARTIALLY_PAID/OVERDUE.
 * - All timestamps UTC; date filters inclusive-exclusive [from, to).
 */
import { prisma } from '@/lib/prisma';
import { monthlyNormalizedMmk } from './constants';
import type { Prisma } from '@prisma/client';

export interface RevenueReport {
  from: Date;
  to: Date;
  verifiedCashReceiptsMmk: number;
  refundsMmk: number;
  netCashReceiptsMmk: number;
  subscriptionRevenueMmk: number;
  creditSalesMmk: number;
  hostingRevenueMmk: number;
  apiRevenueMmk: number;
  otherRevenueMmk: number;
  activeSubscriptions: number;
  mrrMmk: number;
  arrMmk: number;
  outstandingInvoiceCount: number;
  outstandingInvoiceMmk: number;
  vendorLiabilitiesMmk: number;
  revenueByCategory: Array<{ category: string; amountMmk: number }>;
}

export async function buildRevenueReport(from: Date, to: Date): Promise<RevenueReport> {
  const cashWhere: Prisma.BillingLedgerEntryWhereInput = { entryType: 'CASH_RECEIPT', direction: 'CREDIT', postedAt: { gte: from, lt: to } };
  const refundWhere: Prisma.BillingLedgerEntryWhereInput = { entryType: { in: ['REFUND', 'CREDIT_NOTE_ISSUED', 'CREDIT_REVERSAL'] }, direction: 'DEBIT', postedAt: { gte: from, lt: to } };

  const [cashByCategory, refunds, activeSubs, outstanding, vendorLiabilities] = await Promise.all([
    prisma.billingLedgerEntry.findMany({ where: cashWhere, select: { amountMmk: true, invoice: { select: { purpose: true } } } }),
    prisma.billingLedgerEntry.aggregate({ where: refundWhere, _sum: { amountMmk: true } }),
    prisma.billingSubscription.findMany({ where: { status: 'ACTIVE' }, select: { priceMmk: true, cycle: true } }),
    prisma.billingInvoice.aggregate({
      where: { status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum: { totalMmk: true, amountPaidMmk: true },
      _count: true,
    }),
    prisma.vendorEarning.aggregate({
      where: { availableAt: { lte: new Date() } },
      _sum: { netMmk: true },
    }),
  ]);

  const paidOutToVendors = await prisma.vendorPayoutRequest.aggregate({
    where: { status: 'PAID' },
    _sum: { amountMmk: true },
  });

  const categoryTotals = new Map<string, number>();
  let verifiedCashReceiptsMmk = 0;
  for (const entry of cashByCategory) {
    verifiedCashReceiptsMmk += entry.amountMmk;
    const category = entry.invoice?.purpose ?? 'OTHER';
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + entry.amountMmk);
  }
  const refundsMmk = refunds._sum.amountMmk ?? 0;
  const mrrMmk = activeSubs.reduce((sum, s) => sum + monthlyNormalizedMmk(s.priceMmk, s.cycle), 0);
  const outstandingInvoiceMmk = Math.max(0, (outstanding._sum.totalMmk ?? 0) - (outstanding._sum.amountPaidMmk ?? 0));
  const vendorLiabilitiesMmk = Math.max(0, (vendorLiabilities._sum.netMmk ?? 0) - (paidOutToVendors._sum.amountMmk ?? 0));

  const revenueByCategory = [...categoryTotals.entries()].map(([category, amountMmk]) => ({ category, amountMmk })).sort((a, b) => b.amountMmk - a.amountMmk);

  return {
    from,
    to,
    verifiedCashReceiptsMmk,
    refundsMmk,
    netCashReceiptsMmk: verifiedCashReceiptsMmk - refundsMmk,
    subscriptionRevenueMmk: categoryTotals.get('SUBSCRIPTION') ?? 0,
    creditSalesMmk: categoryTotals.get('CREDIT_PACKAGE') ?? 0,
    hostingRevenueMmk: categoryTotals.get('HOSTING') ?? 0,
    apiRevenueMmk: categoryTotals.get('API_USAGE') ?? 0,
    otherRevenueMmk: (categoryTotals.get('PLAN_CHANGE') ?? 0) + (categoryTotals.get('ADJUSTMENT') ?? 0) + (categoryTotals.get('OTHER') ?? 0),
    activeSubscriptions: activeSubs.length,
    mrrMmk,
    arrMmk: mrrMmk * 12,
    outstandingInvoiceCount: outstanding._count ?? 0,
    outstandingInvoiceMmk,
    vendorLiabilitiesMmk,
    revenueByCategory,
  };
}

/** Vendor liabilities detail (kept OUT of platform revenue figures). */
export async function vendorLiabilityBreakdown() {
  const [earnings, payouts] = await Promise.all([
    prisma.vendorEarning.groupBy({ by: ['vendorId'], _sum: { grossMmk: true, platformCommissionMmk: true, netMmk: true } }),
    prisma.vendorPayoutRequest.groupBy({ by: ['vendorId'], where: { status: 'PAID' }, _sum: { amountMmk: true } }),
  ]);
  const payoutByVendor = new Map(payouts.map((p) => [p.vendorId, p._sum.amountMmk ?? 0]));
  if (!earnings.length) return [];
  const vendors = await prisma.vendorProfile.findMany({ where: { id: { in: earnings.map((e) => e.vendorId) } }, select: { id: true, storeName: true } });
  const nameById = new Map(vendors.map((v) => [v.id, v.storeName]));
  return earnings
    .map((e) => ({
      vendorId: e.vendorId,
      vendorName: nameById.get(e.vendorId) ?? e.vendorId,
      grossMmk: e._sum.grossMmk ?? 0,
      platformCommissionMmk: e._sum.platformCommissionMmk ?? 0,
      netMmk: e._sum.netMmk ?? 0,
      paidOutMmk: payoutByVendor.get(e.vendorId) ?? 0,
      liabilityMmk: Math.max(0, (e._sum.netMmk ?? 0) - (payoutByVendor.get(e.vendorId) ?? 0)),
    }))
    .sort((a, b) => b.liabilityMmk - a.liabilityMmk);
}
