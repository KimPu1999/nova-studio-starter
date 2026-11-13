'use server';
/**
 * Phase 18 — customer billing server actions.
 *
 * Every action re-checks authorization server-side (billing account ownership
 * or workspace billing permission). Entitlements are NEVER granted here — they
 * only appear after a finance admin verifies the actual payment (payments.ts).
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'crypto';
import { z } from 'zod';
import { requireUser, csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireBillingAccountAccess, getOrCreatePersonalBillingAccount, getWorkspaceBillingAccount, listBillingAccountsForUser, updateBillingAccount } from '@/lib/billing/accounts';
import { startSubscription, requestPlanChange, cancelSubscription } from '@/lib/billing/subscriptions';
import { submitPaymentAttempt, cancelPaymentAttempt } from '@/lib/billing/payments';
import { purchaseCreditPackage } from '@/lib/billing/credits';
import { requestCreditNote } from '@/lib/billing/refunds';
import { BILLING_LANG_COOKIE } from '@/lib/billing/i18n';
import { billingDetailsSchema, creditPurchaseSchema, planChangeSchema, refundRequestSchema, submitPaymentSchema, subscribeSchema } from '@/lib/billing/validation';

export type BillingFormState = { error?: string; success?: string };

/** Builds a deterministic idempotency key so retried identical submissions cannot duplicate financial records. */
function idem(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40);
}

/** Runs a zod schema against raw form input, surfacing the first issue as a friendly error. */
function parseForm<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(issue?.message ? `Invalid input: ${issue.message}` : 'Invalid form input.');
  }
  return result.data;
}

export async function setBillingLanguageAction(formData: FormData): Promise<void> {
  const lang = String(formData.get('lang') || 'en') === 'mm' ? 'mm' : 'en';
  (await cookies()).set(BILLING_LANG_COOKIE, lang, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 365 * 86_400 });
  revalidatePath('/billing', 'layout');
}

export async function subscribeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrf();
  const input = parseForm(subscribeSchema, {
    planId: String(formData.get('planId') || ''),
    cycle: String(formData.get('cycle') || 'MONTHLY'),
    scope: String(formData.get('scope') || 'PERSONAL'),
    workspaceId: String(formData.get('workspaceId') || '') || undefined,
    // Key is derived server-side so client tampering cannot break idempotency.
    idempotencyKey: idem('subscribe', user.id, String(formData.get('planId') || ''), String(formData.get('scope') || 'PERSONAL'), String(formData.get('workspaceId') || '')),
  });
  if (input.scope === 'WORKSPACE') {
    if (!input.workspaceId) throw new Error('Choose a workspace for workspace billing.');
    const account = await getWorkspaceBillingAccount(input.workspaceId, user);
    await startSubscription({ accountId: account.id, scopeType: 'WORKSPACE', scopeId: input.workspaceId, planId: input.planId, cycle: input.cycle, actorId: user.id });
  } else {
    const account = await getOrCreatePersonalBillingAccount(user.id);
    await startSubscription({ accountId: account.id, scopeType: 'PERSONAL', scopeId: user.id, planId: input.planId, cycle: input.cycle, actorId: user.id });
  }
  revalidatePath('/billing');
  revalidatePath('/billing/subscription');
  redirect('/billing/subscription');
}

export async function requestPlanChangeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrf();
  const input = parseForm(planChangeSchema, {
    subscriptionId: String(formData.get('subscriptionId') || ''),
    targetPlanId: String(formData.get('targetPlanId') || ''),
  });
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: input.subscriptionId }, include: { account: true } });
  if (!subscription) throw new Error('Subscription not found.');
  await requireBillingAccountAccess(subscription.accountId, user);
  const { invoice } = await requestPlanChange(input.subscriptionId, input.targetPlanId, user);
  revalidatePath('/billing/subscription');
  redirect(invoice ? `/billing/invoices/${invoice.id}` : '/billing/subscription');
}

export async function cancelSubscriptionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrf();
  const parsed = parseForm(z.object({ subscriptionId: z.string().uuid() }), { subscriptionId: String(formData.get('subscriptionId') || '') });
  const immediate = String(formData.get('immediate') || '') === 'true';
  const subscription = await prisma.billingSubscription.findUnique({ where: { id: parsed.subscriptionId }, include: { account: true } });
  if (!subscription) throw new Error('Subscription not found.');
  await requireBillingAccountAccess(subscription.accountId, user);
  await cancelSubscription(parsed.subscriptionId, user.id, immediate);
  revalidatePath('/billing/subscription');
}

export async function submitPaymentAction(_prev: BillingFormState, formData: FormData): Promise<BillingFormState> {
  const user = await requireUser();
  await csrf();
  const proof = formData.get('proof');
  let parsed: z.infer<typeof submitPaymentSchema>;
  try {
    parsed = parseForm(submitPaymentSchema, {
      invoiceId: String(formData.get('invoiceId') || ''),
      method: String(formData.get('method') || ''),
      amountMmk: String(formData.get('amountMmk') || ''),
      transactionReference: String(formData.get('transactionReference') || ''),
      idempotencyKey: String(formData.get('idempotencyKey') || '') || idem('pay', user.id, String(formData.get('invoiceId') || ''), String(formData.get('transactionReference') || ''), String(formData.get('amountMmk') || '')),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid payment details.' };
  }
  if (!(proof instanceof File) || proof.size === 0) return { error: 'Attach your payment receipt (PNG, JPEG, or PDF). It is kept private and reviewed by finance staff.' };
  // Idempotency: identical invoice+reference+amount submissions collapse to one attempt.
  const key = parsed.idempotencyKey;
  try {
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: parsed.invoiceId }, include: { account: true } });
    if (!invoice) return { error: 'Invoice not found.' };
    await requireBillingAccountAccess(invoice.accountId, user);
    const attempt = await submitPaymentAttempt({ invoiceId: parsed.invoiceId, user, method: parsed.method, amountMmk: parsed.amountMmk, transactionReference: parsed.transactionReference, proof, idempotencyKey: key });
    if (attempt.status !== 'PENDING_REVIEW') return { error: 'This payment was already reviewed. Submit a new attempt if you paid again.' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to submit payment.' };
  }
  revalidatePath(`/billing/invoices/${parsed.invoiceId}`);
  revalidatePath('/billing/payments');
  return { success: 'Payment submitted. Finance staff will verify the transfer against the actual wallet/bank record — screenshots alone are never proof.' };
}

export async function cancelPaymentAttemptAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrf();
  const parsed = parseForm(z.object({ attemptId: z.string().uuid() }), { attemptId: String(formData.get('attemptId') || '') });
  await cancelPaymentAttempt(parsed.attemptId, user);
  revalidatePath('/billing/payments');
}

export async function purchaseCreditsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrf();
  const input = parseForm(creditPurchaseSchema, {
    packageId: String(formData.get('packageId') || ''),
    idempotencyKey: String(formData.get('idempotencyKey') || '') || idem('credits', user.id, String(formData.get('packageId') || ''), new Date().toISOString().slice(0, 10), randomBytes(4).toString('hex')),
  });
  const invoice = await purchaseCreditPackage(user, input.packageId, input.idempotencyKey);
  revalidatePath('/billing/credits');
  redirect(`/billing/invoices/${invoice.id}`);
}

export async function requestRefundAction(_prev: BillingFormState, formData: FormData): Promise<BillingFormState> {
  const user = await requireUser();
  await csrf();
  const amountRaw = String(formData.get('amountMmk') || '').trim();
  let input: z.infer<typeof refundRequestSchema>;
  try {
    input = parseForm(refundRequestSchema, {
      invoiceId: String(formData.get('invoiceId') || ''),
      amountMmk: amountRaw || undefined,
      reason: String(formData.get('reason') || ''),
      idempotencyKey: idem('refund', String(formData.get('invoiceId') || ''), user.id, amountRaw, new Date().toISOString().slice(0, 10)),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid refund request.' };
  }
  try {
    await requestCreditNote({
      invoiceId: input.invoiceId,
      user,
      amountMmk: input.amountMmk ? Number(input.amountMmk) : undefined,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to request a refund.' };
  }
  revalidatePath(`/billing/invoices/${input.invoiceId}`);
  return { success: 'Refund requested. A finance admin will review it; completion happens only after the payout is confirmed.' };
}

export async function updateBillingSettingsAction(_prev: BillingFormState, formData: FormData): Promise<BillingFormState> {
  const user = await requireUser();
  await csrf();
  const accountId = String(formData.get('accountId') || '');
  const preferencesRaw = String(formData.get('preferences') || '');
  try {
    const details = parseForm(billingDetailsSchema, {
      accountId,
      contactName: String(formData.get('contactName') || '') || undefined,
      contactEmail: String(formData.get('contactEmail') || '') || undefined,
      contactPhone: String(formData.get('contactPhone') || '') || undefined,
      companyInfo: String(formData.get('companyInfo') || '') || undefined,
    });
    const accounts = await listBillingAccountsForUser(user);
    if (!accounts.some((a) => a.id === details.accountId)) throw new Error('Billing account not found.');
    await requireBillingAccountAccess(details.accountId, user);
    let preferences: Record<string, unknown> | undefined;
    if (preferencesRaw.trim()) {
      try {
        preferences = JSON.parse(preferencesRaw) as Record<string, unknown>;
      } catch {
        throw new Error('Preferences must be valid JSON.');
      }
    }
    await updateBillingAccount(details.accountId, user, {
      contactName: details.contactName,
      contactEmail: details.contactEmail,
      contactPhone: details.contactPhone,
      companyInfo: details.companyInfo,
      preferences,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unable to save billing settings.' };
  }
  revalidatePath('/billing/settings');
  return { success: 'Billing details saved.' };
}

async function csrf(): Promise<void> {
  await csrfCheck();
}
