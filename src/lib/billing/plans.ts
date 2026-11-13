/**
 * Phase 18 — plan catalog and versioned pricing.
 *
 * Prices are integer MMK and always resolved through a BillingPlanVersion, so
 * historical invoices keep the price that was current when they were issued.
 * Retiring a version or changing prices never touches past invoices.
 */
import { prisma } from '@/lib/prisma';
import { assertIntMmk } from './constants';
import type { BillingPlan, BillingPlanVersion } from '@prisma/client';

export type PlanWithVersion = BillingPlan & { versions: BillingPlanVersion[] };

/** Lists active plans with their currently ACTIVE version attached. */
export async function listActivePlans(): Promise<PlanWithVersion[]> {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { versions: { where: { status: 'ACTIVE' }, take: 1 } },
  });
  return plans.filter((p) => p.versions.length > 0);
}

/** Resolves the ACTIVE version of a plan, or null. */
export async function getActivePlanVersion(planId: string): Promise<BillingPlanVersion | null> {
  return prisma.billingPlanVersion.findFirst({ where: { planId, status: 'ACTIVE' } });
}

export interface PlanVersionInput {
  planId: string;
  monthlyPriceMmk: number;
  annualPriceMmk: number;
  includedSeats?: number;
  maxSeats?: number | null;
  websitesLimit?: number | null;
  customDomainsLimit?: number | null;
  storageMb?: number | null;
  bandwidthMb?: number | null;
  monthlyAiCredits?: number;
  monthlyApiRequests?: number | null;
  features?: string[];
  notes?: string;
  activate?: boolean;
}

/**
 * Creates a new version of a plan. Existing subscriptions keep their current
 * version; new subscriptions pick the ACTIVE version. When `activate` is true,
 * the previous ACTIVE version is retired atomically (exactly one ACTIVE version
 * per plan at a time).
 */
export async function createPlanVersion(input: PlanVersionInput): Promise<BillingPlanVersion> {
  assertIntMmk(input.monthlyPriceMmk, 'Monthly price');
  assertIntMmk(input.annualPriceMmk, 'Annual price');
  if (input.includedSeats !== undefined && (!Number.isSafeInteger(input.includedSeats) || input.includedSeats < 1)) throw new Error('Included seats must be at least 1.');
  const plan = await prisma.billingPlan.findUnique({ where: { id: input.planId } });
  if (!plan) throw new Error('Plan not found.');
  const latest = await prisma.billingPlanVersion.findFirst({
    where: { planId: input.planId },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;
  return prisma.$transaction(async (tx) => {
    if (input.activate) {
      await tx.billingPlanVersion.updateMany({ where: { planId: input.planId, status: 'ACTIVE' }, data: { status: 'RETIRED' } });
    }
    return tx.billingPlanVersion.create({
      data: {
        planId: input.planId,
        version,
        status: input.activate ? 'ACTIVE' : 'DRAFT',
        monthlyPriceMmk: input.monthlyPriceMmk,
        annualPriceMmk: input.annualPriceMmk,
        includedSeats: input.includedSeats ?? 1,
        maxSeats: input.maxSeats ?? null,
        websitesLimit: input.websitesLimit ?? null,
        customDomainsLimit: input.customDomainsLimit ?? null,
        storageMb: input.storageMb ?? null,
        bandwidthMb: input.bandwidthMb ?? null,
        monthlyAiCredits: input.monthlyAiCredits ?? 0,
        monthlyApiRequests: input.monthlyApiRequests ?? null,
        features: input.features ?? [],
        notes: input.notes,
      },
    });
  });
}

/** Validates that a plan change is allowed (plan exists, is active, has an ACTIVE version). */
export async function resolvePlanChange(currentPlanVersionId: string, targetPlanId: string): Promise<{ target: BillingPlan; targetVersion: BillingPlanVersion }> {
  const current = await prisma.billingPlanVersion.findUnique({ where: { id: currentPlanVersionId }, include: { plan: true } });
  if (!current) throw new Error('Current plan version not found.');
  if (current.planId === targetPlanId) throw new Error('Choose a different plan.');
  const targetVersion = await getActivePlanVersion(targetPlanId);
  if (!targetVersion) throw new Error('Target plan has no active version.');
  const target = await prisma.billingPlan.findUniqueOrThrow({ where: { id: targetPlanId } });
  if (!target.isActive) throw new Error('Target plan is not available.');
  return { target, targetVersion };
}
