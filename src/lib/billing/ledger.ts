/**
 * Phase 18 — financial ledger.
 *
 * Invariants:
 * - Entries are append-only; the API below never updates or deletes entries.
 * - Every posting carries an idempotency key backed by a unique constraint, so
 *   a retried transaction cannot post twice.
 * - CASH_RECEIPT / CREDIT direction increases cash; DEBIT (REFUND, adjustments)
 *   decreases it. Unverified payments are NEVER posted as cash or revenue.
 * - Marketplace vendor commission liabilities remain in the existing vendor
 *   ledger (VendorLedgerEntry); this ledger tracks platform money only, so the
 *   two ledgers are never mixed or double-counted.
 */
import { prisma } from '@/lib/prisma';
import { assertIntMmk } from './constants';
import type { BillingLedgerEntryType, BillingLedgerDirection, Prisma } from '@prisma/client';

export type LedgerClient = Prisma.TransactionClient;

export interface LedgerPostingInput {
  entryType: BillingLedgerEntryType;
  direction: BillingLedgerDirection;
  amountMmk: number;
  currency?: string;
  accountId?: string | null;
  invoiceId?: string | null;
  paymentAttemptId?: string | null;
  creditNoteId?: string | null;
  sourceType: string;
  sourceId: string;
  memo?: string;
  idempotencyKey: string;
  postedById?: string | null;
}

/**
 * Posts one append-only ledger entry inside an existing transaction.
 * Idempotent: a repeated key returns the already-posted entry instead of
 * creating a duplicate row.
 */
export async function postLedgerEntry(tx: LedgerClient, input: LedgerPostingInput) {
  assertIntMmk(input.amountMmk, 'Ledger amount');
  const existing = await tx.billingLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;
  return tx.billingLedgerEntry.create({
    data: {
      entryType: input.entryType,
      direction: input.direction,
      amountMmk: input.amountMmk,
      currency: input.currency ?? 'MMK',
      accountId: input.accountId ?? undefined,
      invoiceId: input.invoiceId ?? undefined,
      paymentAttemptId: input.paymentAttemptId ?? undefined,
      creditNoteId: input.creditNoteId ?? undefined,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      memo: input.memo,
      idempotencyKey: input.idempotencyKey,
      postedById: input.postedById ?? undefined,
    },
  });
}

/** Non-transactional convenience wrapper that opens its own transaction. */
export async function postLedgerEntryStandalone(input: LedgerPostingInput) {
  return prisma.$transaction((tx) => postLedgerEntry(tx, input));
}

/**
 * Recognizes deferred revenue for one subscription invoice at its period end.
 * Idempotent via `recognize:{invoiceId}`.
 */
export async function recognizeSubscriptionRevenue(invoiceId: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.status !== 'PAID') return null;
    const recognized = await postLedgerEntry(tx, {
      entryType: 'REVENUE_RECOGNIZED',
      direction: 'CREDIT',
      amountMmk: invoice.amountPaidMmk,
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      sourceType: 'BillingInvoice',
      sourceId: invoice.id,
      memo: `Revenue recognition for ${invoice.invoiceNumber}`,
      idempotencyKey: `recognize:${invoice.id}`,
    });
    await postLedgerEntry(tx, {
      entryType: 'DEFERRED_REVENUE',
      direction: 'DEBIT',
      amountMmk: invoice.amountPaidMmk,
      accountId: invoice.accountId,
      invoiceId: invoice.id,
      sourceType: 'BillingInvoice',
      sourceId: invoice.id,
      memo: `Deferred revenue release for ${invoice.invoiceNumber}`,
      idempotencyKey: `deferred-release:${invoice.id}`,
    });
    return recognized;
  });
}
