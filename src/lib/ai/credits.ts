import { AiLedgerEntryType, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { emitWebhookEventSafely } from '../webhooks/events';

const AI_CREDITS_LOW_THRESHOLD = Number(process.env.AI_CREDITS_LOW_THRESHOLD || 50);

export async function getOrCreateCreditWallet(userId: string) {
  return prisma.aiCreditWallet.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function reserveCredits(userId: string, amount: number, idempotencyKey: string) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Invalid credit amount.');
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.aiCreditWallet.upsert({ where: { userId }, update: {}, create: { userId } });
    const existing = await tx.aiCreditLedger.findUnique({ where: { idempotencyKey } });
    if (existing) return wallet;
    const updated = await tx.aiCreditWallet.updateMany({ where: { id: wallet.id, balance: { gte: amount } }, data: { balance: { decrement: amount }, reserved: { increment: amount } } });
    if (updated.count !== 1) throw new Error('INSUFFICIENT_AI_CREDITS');
    await tx.aiCreditLedger.create({ data: { walletId: wallet.id, userId, type: AiLedgerEntryType.CREDIT_RESERVATION, amount: -amount, idempotencyKey } });
    return tx.aiCreditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  });
}

export async function releaseReservedCredits(userId: string, amount: number, idempotencyKey: string) {
  return settleReservedCredits(userId, amount, 0, idempotencyKey, AiLedgerEntryType.CREDIT_RELEASE);
}

export async function settleReservedCredits(userId: string, reservedAmount: number, consumedAmount: number, idempotencyKey: string, type: AiLedgerEntryType = AiLedgerEntryType.CREDIT_CONSUMPTION) {
  if (!Number.isInteger(reservedAmount) || reservedAmount < 0 || !Number.isInteger(consumedAmount) || consumedAmount < 0 || consumedAmount > reservedAmount) throw new Error('Invalid credit settlement.');
  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.aiCreditWallet.findUniqueOrThrow({ where: { userId } });
    const existing = await tx.aiCreditLedger.findUnique({ where: { idempotencyKey } });
    if (existing) return wallet;
    await tx.aiCreditWallet.update({ where: { id: wallet.id }, data: { reserved: { decrement: reservedAmount } } });
    if (consumedAmount > 0) await tx.aiCreditLedger.create({ data: { walletId: wallet.id, userId, type, amount: -consumedAmount, idempotencyKey: `${idempotencyKey}:consume` } });
    const released = reservedAmount - consumedAmount;
    if (released > 0) {
      await tx.aiCreditWallet.update({ where: { id: wallet.id }, data: { balance: { increment: released } } });
      await tx.aiCreditLedger.create({ data: { walletId: wallet.id, userId, type: AiLedgerEntryType.CREDIT_RELEASE, amount: released, idempotencyKey: `${idempotencyKey}:release` } });
    }
    return tx.aiCreditWallet.findUniqueOrThrow({ where: { id: wallet.id } });
  });
  // Low-balance signal (fire-and-forget; user-scoped event, no workspace).
  if (result.balance <= AI_CREDITS_LOW_THRESHOLD) {
    emitWebhookEventSafely(null, 'ai.credits.low', { userId, balance: result.balance, threshold: AI_CREDITS_LOW_THRESHOLD });
  }
  return result;
}

export type CreditTransaction = Prisma.TransactionClient;
