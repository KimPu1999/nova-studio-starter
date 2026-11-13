/**
 * Phase 18 — financial reconciliation.
 *
 * A reconciliation run compares an (optionally imported) bank/wallet statement
 * period against verified payment attempts and ledger entries:
 *  - matches statement rows to APPROVED payment attempts by reference+amount,
 *  - flags duplicate references (same reference used twice),
 *  - flags verified payments with no matching statement row (missing cash),
 *  - flags approved payments missing ledger postings (data integrity).
 * Nothing is ever auto-approved: unmatched items require a human decision.
 * Imported statements are stored privately and validated; only references,
 * amounts and dates are parsed — no fabricated bank confirmations.
 */
import { prisma } from '@/lib/prisma';
import { requireFinanceAdmin } from './rbac';
import { billingAudit } from './audit';
import { normalizeReference } from './payments';
import { putPrivateFile } from '@/lib/private-storage';
import { assertIntMmk, utcMonthPeriod } from './constants';
import { z } from 'zod';
import type { User } from '@prisma/client';

export interface StatementRow {
  reference: string;
  amountMmk: number;
  occurredAt?: Date;
}

const statementRowSchema = z.object({
  reference: z.string().trim().min(3).max(200),
  amountMmk: z.coerce.number().int().positive(),
  occurredAt: z.string().optional(),
});

/** Parses a CSV statement (reference,amount,date). Lines with # are comments. */
export function parseStatementCsv(csv: string): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const line of csv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.length < 2) throw new Error(`Invalid statement line: "${trimmed}" (expected reference,amount[,date]).`);
    const parsed = statementRowSchema.safeParse({ reference: parts[0], amountMmk: parts[1], occurredAt: parts[2] });
    if (!parsed.success) throw new Error(`Invalid statement line: "${trimmed}".`);
    rows.push({ reference: normalizeReference(parsed.data.reference), amountMmk: parsed.data.amountMmk, occurredAt: parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : undefined });
  }
  return rows;
}

export interface CreateReconciliationInput {
  financeUser: User;
  periodStart: Date;
  periodEnd: Date;
  statementName?: string;
  statementCsv?: string;
  totalStatementAmountMmk?: number;
}

export interface ReconciliationSummary {
  id: string;
  reportNumber: string;
  matchedCount: number;
  matchedAmountMmk: number;
  unmatchedCount: number;
  unmatchedAmountMmk: number;
  duplicateCount: number;
  missingLedgerCount: number;
  missingStatementCount: number;
}

/**
 * Creates a reconciliation run and performs deterministic matching. Matched
 * items carry their target; everything else is UNMATCHED for human review.
 */
export async function createReconciliationRun(input: CreateReconciliationInput): Promise<ReconciliationSummary> {
  const now = new Date();
  const reportNumber = `REC-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${now.getTime().toString(36).toUpperCase().slice(-6)}`;
  let statementStorageKey: string | undefined;
  let rows: StatementRow[] = [];
  if (input.statementCsv?.trim()) {
    rows = parseStatementCsv(input.statementCsv);
    statementStorageKey = await putPrivateFile(Buffer.from(input.statementCsv, 'utf8'), 'csv');
  }
  assertIntMmk(input.totalStatementAmountMmk ?? 0, 'Statement total (optional)');

  const report = await prisma.billingReconciliation.create({
    data: {
      reportNumber,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: 'OPEN',
      statementName: input.statementName,
      statementStorageKey,
      totalStatementAmountMmk: input.totalStatementAmountMmk ?? null,
      importedById: input.financeUser.id,
    },
  });

  const attempts = await prisma.billingPaymentAttempt.findMany({
    where: { status: 'APPROVED', reviewedAt: { gte: input.periodStart, lt: input.periodEnd } },
  });

  // 1. Duplicate reference detection across approved attempts and statement rows.
  const referenceCounts = new Map<string, number>();
  for (const attempt of attempts) referenceCounts.set(attempt.transactionReference, (referenceCounts.get(attempt.transactionReference) ?? 0) + 1);
  for (const row of rows) referenceCounts.set(row.reference, (referenceCounts.get(row.reference) ?? 0) + 1);
  const duplicateRefs = new Set([...referenceCounts.entries()].filter(([, n]) => n > 1).map(([ref]) => ref));

  let matchedCount = 0, matchedAmount = 0, unmatchedCount = 0, unmatchedAmount = 0, duplicateCount = 0, missingStatementCount = 0;
  const usedStatementRows = new Set<string>();

  // 2. Match each approved attempt against statement rows (reference + amount).
  for (const attempt of attempts) {
    const statementRow = rows.find((r) => r.reference === attempt.transactionReference && r.amountMmk === attempt.amountMmk && !usedStatementRows.has(r.reference));
    if (statementRow) usedStatementRows.add(statementRow.reference);
    const isDuplicate = duplicateRefs.has(attempt.transactionReference);
    await prisma.billingReconciliationItem.upsert({
      where: { reconciliationId_kind_reference: { reconciliationId: report.id, kind: 'PAYMENT_ATTEMPT', reference: attempt.transactionReference } },
      update: {},
      create: {
        reconciliationId: report.id,
        kind: 'PAYMENT_ATTEMPT',
        reference: attempt.transactionReference,
        amountMmk: attempt.amountMmk,
        status: statementRow ? 'MATCHED' : isDuplicate ? 'INVESTIGATING' : 'UNMATCHED',
        matchTargetType: statementRow ? 'STATEMENT_ROW' : null,
        matchTargetId: attempt.id,
        note: statementRow ? 'Matched to statement row.' : isDuplicate ? 'DUPLICATE_REFERENCE — same reference used more than once; investigate.' : 'No statement row matched this verified payment.',
        reviewedById: input.financeUser.id,
      },
    });
    if (statementRow) { matchedCount++; matchedAmount += attempt.amountMmk; }
    else { unmatchedCount++; unmatchedAmount += attempt.amountMmk; missingStatementCount++; }
    if (isDuplicate) duplicateCount++;
  }

  // 3. Statement rows that match nothing.
  for (const row of rows) {
    if (usedStatementRows.has(row.reference)) continue;
    const matchingAttempt = attempts.find((a) => a.transactionReference === row.reference);
    await prisma.billingReconciliationItem.upsert({
      where: { reconciliationId_kind_reference: { reconciliationId: report.id, kind: 'PAYMENT_ATTEMPT', reference: row.reference } },
      update: {},
      create: {
        reconciliationId: report.id,
        kind: 'PAYMENT_ATTEMPT',
        reference: row.reference,
        amountMmk: row.amountMmk,
        status: matchingAttempt ? 'MATCHED' : 'UNMATCHED',
        matchTargetType: matchingAttempt ? 'BillingPaymentAttempt' : null,
        matchTargetId: matchingAttempt?.id,
        note: matchingAttempt ? 'Matched to a verified payment attempt.' : 'Statement row with no verified payment attempt — money may have arrived without a matching submission.',
        reviewedById: input.financeUser.id,
      },
    });
    if (matchingAttempt) { matchedCount++; matchedAmount += row.amountMmk; }
    else { unmatchedCount++; unmatchedAmount += row.amountMmk; }
  }

  // 4. Verified payments missing ledger postings (integrity check).
  const approvedIds = attempts.map((a) => a.id);
  const postedKeys = approvedIds.length ? await prisma.billingLedgerEntry.findMany({ where: { paymentAttemptId: { in: approvedIds } }, select: { paymentAttemptId: true } }) : [];
  const postedSet = new Set(postedKeys.map((p) => p.paymentAttemptId));
  let missingLedgerCount = 0;
  for (const attempt of attempts) {
    if (postedSet.has(attempt.id)) continue;
    missingLedgerCount++;
    await prisma.billingReconciliationItem.upsert({
      where: { reconciliationId_kind_reference: { reconciliationId: report.id, kind: 'LEDGER_ENTRY', reference: attempt.transactionReference } },
      update: {},
      create: {
        reconciliationId: report.id,
        kind: 'LEDGER_ENTRY',
        reference: attempt.transactionReference,
        amountMmk: attempt.amountMmk,
        status: 'INVESTIGATING',
        matchTargetId: attempt.id,
        note: 'Verified payment without a ledger posting — data integrity issue; contact an engineer.',
        reviewedById: input.financeUser.id,
      },
    });
  }

  await prisma.billingReconciliation.update({
    where: { id: report.id },
    data: { matchedCount, matchedAmountMmk: matchedAmount, unmatchedCount, unmatchedAmountMmk: unmatchedAmount },
  });
  await billingAudit({ actorId: input.financeUser.id, entityType: 'BillingReconciliation', entityId: report.id, action: 'CREATE_RECONCILIATION', after: { reportNumber, matchedCount, unmatchedCount, duplicateCount, missingLedgerCount } });
  return { id: report.id, reportNumber, matchedCount, matchedAmountMmk: matchedAmount, unmatchedCount, unmatchedAmountMmk: unmatchedAmount, duplicateCount, missingLedgerCount, missingStatementCount };
}

/** Resolves one item (human decision). Never approves payments automatically. */
export async function resolveReconciliationItem(itemId: string, financeUser: User, status: 'MATCHED' | 'INVESTIGATING' | 'RESOLVED', note?: string) {
  await requireFinanceAdmin();
  const item = await prisma.billingReconciliationItem.findUnique({ where: { id: itemId }, include: { reconciliation: true } });
  if (!item) throw new Error('Reconciliation item not found.');
  if (item.reconciliation.status !== 'OPEN') throw new Error('This reconciliation run is closed.');
  await prisma.billingReconciliationItem.update({ where: { id: itemId }, data: { status, note: note ?? item.note, reviewedById: financeUser.id, resolvedAt: status === 'RESOLVED' ? new Date() : null } });
  await billingAudit({ actorId: financeUser.id, entityType: 'BillingReconciliationItem', entityId: itemId, action: `RESOLVE_${status}`, after: { note } });
}

/** Closes a reconciliation run with a summary note. */
export async function closeReconciliationRun(reportId: string, financeUser: User, notes?: string) {
  await requireFinanceAdmin();
  const report = await prisma.billingReconciliation.findUnique({ where: { id: reportId }, include: { items: true } });
  if (!report) throw new Error('Reconciliation report not found.');
  if (report.status !== 'OPEN') throw new Error('Report already closed.');
  const blocking = report.items.filter((i) => i.status === 'UNMATCHED' || i.status === 'INVESTIGATING');
  await prisma.billingReconciliation.update({ where: { id: reportId }, data: { status: 'CLOSED', closedAt: new Date(), closedById: financeUser.id, notes: notes ?? (blocking.length ? `Closed with ${blocking.length} unresolved item(s).` : 'Fully reconciled.') } });
  await billingAudit({ actorId: financeUser.id, entityType: 'BillingReconciliation', entityId: reportId, action: 'CLOSE_RECONCILIATION', after: { unresolved: blocking.length } });
}

/** Current-period default for the admin page. */
export function defaultReconciliationPeriod() {
  return utcMonthPeriod();
}
