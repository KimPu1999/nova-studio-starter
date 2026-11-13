/**
 * Phase 18 — AI credit packages.
 *
 * Purchases reuse the Phase 13 AI credit wallet/ledger — no parallel balances.
 * Credits are granted ONLY inside the verified-payment transaction (see
 * payments.ts), keyed by invoice idempotency, so grants cannot double-fire.
 * Refunds reverse credits through CREDIT_REFUND ledger entries without going
 * below zero (see refunds.ts).
 */
import { prisma } from '@/lib/prisma';
import { createInvoice, issueInvoice } from './invoices';
import { getOrCreatePersonalBillingAccount } from './accounts';
import { billingAudit, billingNotify } from './audit';
import { assertIntMmk } from './constants';
import type { BillingCreditPackage, User } from '@prisma/client';

export async function listActiveCreditPackages(): Promise<BillingCreditPackage[]> {
  return prisma.billingCreditPackage.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
}

/**
 * Customer purchases a credit package: creates an ISSUED invoice. Payment is
 * manual (KBZPay/WavePay/bank) and credits appear only after verification.
 */
export async function purchaseCreditPackage(user: User, packageId: string, idempotencyKey: string) {
  const creditPackage = await prisma.billingCreditPackage.findUnique({ where: { id: packageId } });
  if (!creditPackage || !creditPackage.isActive) throw new Error('Credit package not available.');
  assertIntMmk(creditPackage.priceMmk, 'Credit package price');
  assertIntMmk(creditPackage.credits, 'Credit package credits');
  const account = await getOrCreatePersonalBillingAccount(user.id);
  const totalCredits = creditPackage.credits + creditPackage.bonusCredits;
  const invoice = await createInvoice({
    accountId: account.id,
    purpose: 'CREDIT_PACKAGE',
    dueAt: new Date(Date.now() + 3 * 86_400_000),
    idempotencyKey,
    actorId: user.id,
    notes: `AI credit package ${creditPackage.code}`,
    lines: [{ lineType: 'AI_CREDITS', description: `${creditPackage.name} · ${creditPackage.credits.toLocaleString()} credits${creditPackage.bonusCredits ? ` + ${creditPackage.bonusCredits.toLocaleString()} bonus` : ''}`, quantity: 1, unitAmountMmk: creditPackage.priceMmk }],
  });
  if (invoice.status === 'DRAFT') {
    const issued = await issueInvoice(invoice.id, user.id);
    await prisma.billingInvoice.update({ where: { id: issued.id }, data: { metadata: { credits: totalCredits, packageId: creditPackage.id, packageName: creditPackage.name } as never } });
    await billingNotify(user.id, 'BILLING_INVOICE_ISSUED', 'Credit package invoice ready', `Pay ${creditPackage.priceMmk.toLocaleString()} MMK for ${totalCredits.toLocaleString()} AI credits. Credits are added after payment verification.`, `/billing/invoices/${issued.id}`);
    await billingAudit({ actorId: user.id, accountId: account.id, entityType: 'BillingInvoice', entityId: issued.id, action: 'PURCHASE_CREDIT_PACKAGE', after: { packageId, totalCredits, priceMmk: creditPackage.priceMmk } });
    return issued;
  }
  return invoice;
}

/** Credit purchase history (verified grants only), for the /billing/credits page. */
export async function getCreditPurchaseHistory(userId: string, take = 20) {
  return prisma.aiCreditLedger.findMany({
    where: { userId, type: { in: ['CREDIT_PURCHASE', 'CREDIT_GRANT', 'CREDIT_REFUND'] } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}

/** Credit usage history (consumption), for the /billing/usage page. */
export async function getCreditUsageHistory(userId: string, take = 20) {
  return prisma.aiCreditLedger.findMany({
    where: { userId, type: { in: ['CREDIT_RESERVATION', 'CREDIT_CONSUMPTION', 'CREDIT_RELEASE'] } },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
