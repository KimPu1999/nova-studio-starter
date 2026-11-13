/**
 * Phase 18 — billing integration tests against PostgreSQL.
 *
 * These tests exercise the REAL database constraints (unique idempotency keys,
 * payment-reference uniqueness, entitlement uniqueness) and the transactional
 * services. Every test runs inside a transaction that throws at the end, so the
 * database is rolled back and nothing is persisted. Skipped when DATABASE_URL
 * is not configured.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, RoleCode } from '@prisma/client';
import { ingestUsageEvent } from '../src/lib/billing/usage';
import { applyInvoicePayment, postInvoiceSettlementLedger } from '../src/lib/billing/invoices';
import { assertSeatAvailable } from '../src/lib/billing/seats';

const prisma = new PrismaClient();
const hasDb = Boolean(process.env.DATABASE_URL);

/** Reuses the existing CUSTOMER role for temp users (created via upsert inside the rolled-back tx). */
async function tempUser(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], email: string) {
  const role = await tx.adminRole.upsert({ where: { code: RoleCode.CUSTOMER }, update: {}, create: { code: RoleCode.CUSTOMER, name: 'Customer' } });
  return tx.user.create({ data: { email, name: 'Integration', passwordHash: 'x', roleId: role.id } });
}
describe.skipIf(!hasDb)('billing database invariants (rollback transactions)', () => {
  it('rejects duplicate transaction references for the same method', async () => {
    const run = () => prisma.$transaction(async (tx) => {
      const user = await tempUser(tx, `billing-test-${Date.now()}@example.com`);
      const account = await tx.billingAccount.create({ data: { billingKey: `USER:${user.id}`, type: 'PERSONAL', ownerUserId: user.id, name: 'Integration' } });
      const invoice = await tx.billingInvoice.create({ data: { invoiceNumber: `INT-${Date.now()}`, accountId: account.id, purpose: 'SUBSCRIPTION', status: 'ISSUED', dueAt: new Date(), totalMmk: 10_000, subtotalMmk: 10_000, idempotencyKey: `int:invoice:${Date.now()}`, lines: { create: [{ lineType: 'SUBSCRIPTION_PLAN', description: 'Test', quantity: 1, unitAmountMmk: 10_000, amountMmk: 10_000 }] } } });
      const reference = `INTREF${Date.now()}`;
      await tx.billingPaymentAttempt.create({ data: { invoiceId: invoice.id, accountId: account.id, method: 'KBZPAY', amountMmk: 10_000, transactionReference: reference, status: 'PENDING_REVIEW', submittedById: user.id, idempotencyKey: `int:attempt:${Date.now()}` } });
      // Second attempt reusing the same (method, reference) must violate the unique constraint.
      await tx.$executeRaw`SAVEPOINT dupref`;
      await expect(tx.billingPaymentAttempt.create({ data: { invoiceId: invoice.id, accountId: account.id, method: 'KBZPAY', amountMmk: 10_000, transactionReference: reference, status: 'PENDING_REVIEW', submittedById: user.id, idempotencyKey: `int:attempt2:${Date.now()}` } })).rejects.toThrow();
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT dupref`;
      throw new Error('ROLLBACK');
    });
    await expect(run()).rejects.toThrow('ROLLBACK');
  });

  it('rejects duplicate ledger idempotency keys and duplicate invoice payment application', async () => {
    const now = Date.now();
    const run = prisma.$transaction(async (tx) => {
      const user = await tempUser(tx, `billing-test-${now}@example.com`);
      const account = await tx.billingAccount.create({ data: { billingKey: `USER:${user.id}`, type: 'PERSONAL', ownerUserId: user.id, name: 'Integration' } });
      const invoice = await tx.billingInvoice.create({ data: { invoiceNumber: `INT-${now}`, accountId: account.id, purpose: 'SUBSCRIPTION', status: 'ISSUED', dueAt: new Date(), totalMmk: 10_000, subtotalMmk: 10_000, idempotencyKey: `int:ledger:${now}`, lines: { create: [{ lineType: 'SUBSCRIPTION_PLAN', description: 'Test', quantity: 1, unitAmountMmk: 10_000, amountMmk: 10_000 }] } } });

      const first = await applyInvoicePayment(tx, invoice.id, 4_000);
      expect(first.fullyPaid).toBe(false);

      // Overpayment must be rejected (inside a savepoint: Postgres aborts the tx on error).
      await tx.$executeRaw`SAVEPOINT overpay`;
      await expect(applyInvoicePayment(tx, invoice.id, 7_000)).rejects.toThrow(/exceeds/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT overpay`;

      const second = await applyInvoicePayment(tx, invoice.id, 6_000);
      expect(second.fullyPaid).toBe(true);

      // Duplicate ledger idempotency key is not allowed.
      const key = `cash:int:${now}`;
      await tx.billingLedgerEntry.create({ data: { entryType: 'CASH_RECEIPT', direction: 'CREDIT', amountMmk: 10_000, accountId: account.id, invoiceId: invoice.id, sourceType: 'Test', sourceId: invoice.id, idempotencyKey: key } });
      await tx.$executeRaw`SAVEPOINT dupledger`;
      await expect(tx.billingLedgerEntry.create({ data: { entryType: 'CASH_RECEIPT', direction: 'CREDIT', amountMmk: 10_000, accountId: account.id, invoiceId: invoice.id, sourceType: 'Test', sourceId: invoice.id, idempotencyKey: key } })).rejects.toThrow();
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT dupledger`;

      // Idempotent ledger posting helper returns the existing entry instead of duplicating.
      // Settlement posting is idempotent: posting twice leaves exactly one entry.
      await postInvoiceSettlementLedger(tx, { id: invoice.id, invoiceNumber: invoice.invoiceNumber, accountId: account.id, amountPaidMmk: 10_000, purpose: 'CREDIT_PACKAGE' }, null, 1_000);
      await postInvoiceSettlementLedger(tx, { id: invoice.id, invoiceNumber: invoice.invoiceNumber, accountId: account.id, amountPaidMmk: 10_000, purpose: 'CREDIT_PACKAGE' }, null, 1_000);
      const cashCount = await tx.billingLedgerEntry.count({ where: { idempotencyKey: `cash:${invoice.id}` } });
      expect(cashCount).toBe(1);
      throw new Error('ROLLBACK');
    });
    await expect(run).rejects.toThrow('ROLLBACK');
  });

  it('ingests usage events idempotently (no double-counting) and cleans up', async () => {
    const sourceEventId = `int-usage-${Date.now()}`;
    try {
      const first = await ingestUsageEvent({ meterCode: 'AI_CREDITS', sourceEventId, sourceType: 'Test', subjectType: 'USER', subjectId: `int-user-${Date.now()}`, quantity: 5, quality: 'VERIFIED' });
      expect(first).toBe(true);
      const replay = await ingestUsageEvent({ meterCode: 'AI_CREDITS', sourceEventId, sourceType: 'Test', subjectType: 'USER', subjectId: `int-user-${Date.now()}`, quantity: 5, quality: 'VERIFIED' });
      expect(replay).toBe(false);
    } finally {
      const meter = await prisma.billingUsageMeter.findUnique({ where: { code: 'AI_CREDITS' } });
      if (meter) {
        const events = await prisma.billingUsageEvent.findMany({ where: { meterId: meter.id, sourceEventId } });
        for (const event of events) {
          await prisma.billingUsageAggregate.deleteMany({ where: { meterId: meter.id, subjectType: event.subjectType, subjectId: event.subjectId, periodStart: event.periodStart, periodEnd: event.periodEnd } });
          await prisma.billingUsageEvent.delete({ where: { id: event.id } });
        }
      }
    }
  });

  it('enforces seat limits inside the invitation transaction', async () => {
    const now = Date.now();
    const run = prisma.$transaction(async (tx) => {
      const owner = await tempUser(tx, `billing-seat-${now}@example.com`);
      const org = await tx.organization.create({ data: { name: `Org ${now}`, slug: `org-${now}`, ownerId: owner.id, createdById: owner.id } });
      const workspace = await tx.workspace.create({ data: { name: 'WS', slug: `ws-${now}`, organizationId: org.id } });
      const account = await tx.billingAccount.create({ data: { billingKey: `ORG:${org.id}`, type: 'ORGANIZATION', ownerUserId: owner.id, organizationId: org.id, name: 'Org' } });
      await tx.billingEntitlement.create({ data: { accountId: account.id, scopeKey: `WS:${workspace.id}`, featureKey: 'seats.max', valueInt: 1 } });
      await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: owner.id, role: 'OWNER' } });
      // Seat used (owner) + limit 1 -> the next invite must fail.
      await tx.$executeRaw`SAVEPOINT seatlimit`;
      await expect(assertSeatAvailable(workspace.id, org.id, tx)).rejects.toThrow(/Seat limit reached/);
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT seatlimit`;
      throw new Error('ROLLBACK');
    });
    await expect(run).rejects.toThrow('ROLLBACK');
  });
});

beforeAll(async () => { if (hasDb) await prisma.$connect(); });
afterAll(async () => { if (hasDb) await prisma.$disconnect(); });
