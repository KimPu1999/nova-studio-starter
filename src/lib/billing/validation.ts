/**
 * Phase 18 — Zod validation schemas for billing forms and API inputs.
 */
import { z } from 'zod';

export const billingPaymentMethodSchema = z.enum(['KBZPAY', 'WAVEPAY', 'BANK_TRANSFER']);

export const submitPaymentSchema = z.object({
  invoiceId: z.string().uuid(),
  method: billingPaymentMethodSchema,
  amountMmk: z.coerce.number().int().positive(),
  transactionReference: z.string().trim().min(4).max(200),
  idempotencyKey: z.string().min(8).max(100),
});

export const reviewPaymentSchema = z.object({
  attemptId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().trim().max(500).optional(),
  verificationNote: z.string().trim().max(500).optional(),
});

export const billingDetailsSchema = z.object({
  accountId: z.string().uuid(),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  companyInfo: z.string().trim().max(400).optional(),
});

export const subscribeSchema = z.object({
  planId: z.string().uuid(),
  cycle: z.enum(['MONTHLY', 'ANNUAL']),
  scope: z.enum(['PERSONAL', 'WORKSPACE']).default('PERSONAL'),
  workspaceId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export const planChangeSchema = z.object({
  subscriptionId: z.string().uuid(),
  targetPlanId: z.string().uuid(),
});

export const creditPurchaseSchema = z.object({
  packageId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(100),
});

export const refundRequestSchema = z.object({
  invoiceId: z.string().uuid(),
  amountMmk: z.coerce.number().int().positive().optional(),
  reason: z.string().trim().min(10).max(1000),
  idempotencyKey: z.string().min(8).max(100),
});

export const refundReviewSchema = z.object({
  creditNoteId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().trim().max(500).optional(),
});

export const refundCompleteSchema = z.object({
  creditNoteId: z.string().uuid(),
  payoutMethod: z.string().trim().min(2).max(60),
  payoutReference: z.string().trim().min(4).max(200),
  reverseEntitlement: z.enum(['true', 'false']).default('true'),
});

export const reconciliationCreateSchema = z.object({
  periodStart: z.string().min(4),
  periodEnd: z.string().min(4),
  statementName: z.string().trim().max(120).optional(),
  statementCsv: z.string().max(2_000_000).optional(),
  totalStatementAmountMmk: z.coerce.number().int().nonnegative().optional(),
});

export const reconciliationItemResolveSchema = z.object({
  itemId: z.string().uuid(),
  status: z.enum(['MATCHED', 'INVESTIGATING', 'RESOLVED']),
  note: z.string().trim().max(500).optional(),
});

export const planVersionSchema = z.object({
  planId: z.string().uuid(),
  monthlyPriceMmk: z.coerce.number().int().nonnegative(),
  annualPriceMmk: z.coerce.number().int().nonnegative(),
  includedSeats: z.coerce.number().int().min(1).default(1),
  maxSeats: z.coerce.number().int().min(1).optional(),
  websitesLimit: z.coerce.number().int().min(0).optional(),
  customDomainsLimit: z.coerce.number().int().min(0).optional(),
  storageMb: z.coerce.number().int().min(0).optional(),
  bandwidthMb: z.coerce.number().int().min(0).optional(),
  monthlyAiCredits: z.coerce.number().int().nonnegative().default(0),
  monthlyApiRequests: z.coerce.number().int().nonnegative().optional(),
  features: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  activate: z.enum(['true', 'false']).default('true'),
});

export const invoiceCreateSchema = z.object({
  accountId: z.string().uuid(),
  purpose: z.enum(['SUBSCRIPTION', 'CREDIT_PACKAGE', 'HOSTING', 'API_USAGE', 'ADJUSTMENT']).default('ADJUSTMENT'),
  lines: z.string().trim().min(3).max(5000),
  dueInDays: z.coerce.number().int().min(1).max(90).default(7),
  idempotencyKey: z.string().min(8).max(100),
});

/** Parses "Description | qty | unitAmount" invoice line input from admin forms. */
export function parseInvoiceLines(raw: string): Array<{ lineType: 'ADJUSTMENT' | 'OTHER'; description: string; quantity: number; unitAmountMmk: number }> {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split('|').map((p) => p.trim());
      if (parts.length < 2) throw new Error('Each line must be: Description | Amount (optionally Description | Qty | Amount).');
      const [description, b, c] = parts;
      const quantity = c !== undefined ? Number(b) : 1;
      const unitAmountMmk = c !== undefined ? Number(c) : Number(b);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(unitAmountMmk) || unitAmountMmk < 0) {
        throw new Error(`Invalid line: "${l}"`);
      }
      return { lineType: 'ADJUSTMENT' as const, description, quantity, unitAmountMmk };
    });
}
