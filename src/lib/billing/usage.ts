/**
 * Phase 18 — usage metering and quotas.
 *
 * Principles:
 * - Existing usage records (AiUsageRecord, ApiUsageEvent, HostingUsageRecord,
 *   WebsiteDeployment) remain the SOURCE OF TRUTH. This module meters them into
 *   BillingUsageEvent rows with idempotent (meterId, sourceEventId) uniqueness,
 *   so existing records are never double-counted.
 * - Ingestion is idempotent and safe to retry; a repeated sourceEventId returns
 *   the existing event without touching aggregates.
 * - Quotas come from entitlements (verified subscription state). Overage never
 *   triggers automatic billing — it produces a soft signal for admins.
 */
import { prisma } from '@/lib/prisma';
import { utcMonthPeriod } from './constants';
import { resolveEntitlements, assertWithinQuota } from './entitlements';
import type { BillingUsageMeterCode, BillingUsageSubjectType, BillingUsageQuality, Prisma } from '@prisma/client';

export type UsageClient = Prisma.TransactionClient;

/** Ensures the six platform meters exist (seed helper, idempotent). */
export async function ensureBillingMeters() {
  const meters: Array<{ code: BillingUsageMeterCode; name: string; unit: string; description: string }> = [
    { code: 'AI_TOKENS', name: 'AI token usage', unit: 'tokens', description: 'Input+output tokens across AI features.' },
    { code: 'AI_CREDITS', name: 'AI credits consumed', unit: 'credits', description: 'Credits consumed from wallets and workspaces.' },
    { code: 'API_REQUESTS', name: 'API requests', unit: 'requests', description: 'Public API v1 requests per credential/workspace.' },
    { code: 'HOSTING_STORAGE_MB', name: 'Hosting storage', unit: 'MB', description: 'Storage consumed by hosted websites.' },
    { code: 'HOSTING_BANDWIDTH_MB', name: 'Hosting bandwidth', unit: 'MB', description: 'Bandwidth served by hosted websites.' },
    { code: 'DEPLOYMENTS', name: 'Deployments', unit: 'deployments', description: 'Website deployment counts.' },
  ];
  for (const meter of meters) {
    await prisma.billingUsageMeter.upsert({ where: { code: meter.code }, update: { name: meter.name, unit: meter.unit, description: meter.description }, create: meter });
  }
  return prisma.billingUsageMeter.findMany();
}

export interface IngestUsageInput {
  meterCode: BillingUsageMeterCode;
  sourceEventId: string;
  sourceType: string;
  sourceId?: string | null;
  subjectType: BillingUsageSubjectType;
  subjectId: string;
  quantity: number;
  quality?: BillingUsageQuality;
  occurredAt?: Date;
}

/**
 * Idempotent usage ingestion. Returns true when a NEW event was recorded,
 * false when the event already existed (no double-counting).
 */
export async function ingestUsageEvent(input: IngestUsageInput): Promise<boolean> {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('Usage quantity must be a positive integer.');
  const meter = await prisma.billingUsageMeter.findUnique({ where: { code: input.meterCode } });
  if (!meter || !meter.isActive) throw new Error(`Unknown or inactive usage meter: ${input.meterCode}`);
  const occurredAt = input.occurredAt ?? new Date();
  const { periodStart, periodEnd } = utcMonthPeriod(occurredAt);
  const quality = input.quality ?? 'ESTIMATED';
  try {
    await prisma.$transaction(async (tx) => {
      await tx.billingUsageEvent.create({
        data: {
          meterId: meter.id,
          sourceEventId: input.sourceEventId,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? undefined,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          quantity: input.quantity,
          quality,
          occurredAt,
          periodStart,
          periodEnd,
        },
      });
      await tx.billingUsageAggregate.upsert({
        where: { meterId_subjectType_subjectId_periodStart_periodEnd: { meterId: meter.id, subjectType: input.subjectType, subjectId: input.subjectId, periodStart, periodEnd } },
        update: { totalQuantity: { increment: input.quantity }, eventCount: { increment: 1 }, lastEventAt: occurredAt, isEstimated: quality === 'ESTIMATED' },
        create: { meterId: meter.id, subjectType: input.subjectType, subjectId: input.subjectId, periodStart, periodEnd, totalQuantity: input.quantity, eventCount: 1, lastEventAt: occurredAt, isEstimated: quality === 'ESTIMATED' },
      });
    });
    return true;
  } catch (error) {
    // Unique violation => already ingested; treat as replay, not failure.
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: string }).code === 'P2002') return false;
    throw error;
  }
}

/** Reads period usage for a subject (aggregate table, single query). */
export async function getPeriodUsage(meterCode: BillingUsageMeterCode, subjectType: BillingUsageSubjectType, subjectId: string, period?: { periodStart: Date; periodEnd: Date }) {
  const meter = await prisma.billingUsageMeter.findUnique({ where: { code: meterCode } });
  if (!meter) return { totalQuantity: 0, eventCount: 0, isEstimated: true };
  const { periodStart, periodEnd } = period ?? utcMonthPeriod();
  const aggregate = await prisma.billingUsageAggregate.findUnique({
    where: { meterId_subjectType_subjectId_periodStart_periodEnd: { meterId: meter.id, subjectType, subjectId, periodStart, periodEnd } },
  });
  return { totalQuantity: aggregate?.totalQuantity ?? 0, eventCount: aggregate?.eventCount ?? 0, isEstimated: aggregate?.isEstimated ?? true };
}

export interface QuotaCheckResult {
  allowed: boolean;
  limit: number | null;
  current: number;
  overage: number;
}

/**
 * Checks a meter quota against entitlements for the scope owner. Overage is
 * reported (for reporting/upgrade prompts), never billed automatically.
 */
export async function checkUsageQuota(
  meterCode: BillingUsageMeterCode,
  accountId: string,
  scopeType: BillingUsageSubjectType extends never ? never : 'PERSONAL' | 'WORKSPACE' | 'WEBSITE',
  scopeId: string,
  subjectType: BillingUsageSubjectType,
  subjectId: string,
  additional = 0,
): Promise<QuotaCheckResult> {
  const entitlements = await resolveEntitlements(accountId, scopeType, scopeId);
  const limit = meterCode === 'API_REQUESTS' ? entitlements.monthlyApiRequests : meterCode === 'AI_CREDITS' ? entitlements.monthlyAiCredits : meterCode === 'HOSTING_STORAGE_MB' ? entitlements.storageMb : meterCode === 'HOSTING_BANDWIDTH_MB' ? entitlements.bandwidthMb : meterCode === 'DEPLOYMENTS' ? entitlements.websitesLimit : null;
  const { totalQuantity } = await getPeriodUsage(meterCode, subjectType, subjectId);
  const allowed = assertWithinQuota(limit, totalQuantity, additional);
  return { allowed, limit, current: totalQuantity, overage: Math.max(0, totalQuantity + additional - (limit ?? Number.MAX_SAFE_INTEGER)) };
}

/**
 * Backfills meters from existing Phase 12–17 usage records.
 * Idempotent: sourceEventId equals the source record id, so re-running syncs
 * nothing twice.
 */
export async function syncExistingUsageRecords(options?: { limit?: number }): Promise<{ aiCredits: number; apiRequests: number; storage: number; bandwidth: number; deployments: number }> {
  await ensureBillingMeters();
  const limit = Math.min(options?.limit ?? 500, 2000);
  let aiCredits = 0, apiRequests = 0, storage = 0, bandwidth = 0, deploymentCount = 0;

  const aiRecords = await prisma.aiUsageRecord.findMany({ where: { creditsConsumed: { gt: 0 }, status: 'SUCCEEDED' }, take: limit, orderBy: { createdAt: 'asc' } });
  for (const record of aiRecords) {
    const ingested = await ingestUsageEvent({ meterCode: 'AI_CREDITS', sourceEventId: `ai-usage:${record.id}`, sourceType: 'AiUsageRecord', sourceId: record.id, subjectType: 'USER', subjectId: record.userId, quantity: record.creditsConsumed, quality: 'VERIFIED', occurredAt: record.createdAt });
    if (ingested) aiCredits++;
    if (record.inputTokens || record.outputTokens) {
      const ingestedTokens = await ingestUsageEvent({ meterCode: 'AI_TOKENS', sourceEventId: `ai-usage:${record.id}`, sourceType: 'AiUsageRecord', sourceId: record.id, subjectType: 'USER', subjectId: record.userId, quantity: (record.inputTokens ?? 0) + (record.outputTokens ?? 0), quality: 'VERIFIED', occurredAt: record.createdAt });
      if (ingestedTokens) aiCredits++;
    }
  }

  const apiEvents = await prisma.apiUsageEvent.findMany({ where: { rateLimited: false }, take: limit, orderBy: { createdAt: 'asc' } });
  for (const event of apiEvents) {
    const subject = event.workspaceId ? 'WORKSPACE' : 'API_CREDENTIAL';
    const subjectId = (event.workspaceId ?? event.credentialId) as string;
    if (!subjectId) continue;
    const ingested = await ingestUsageEvent({ meterCode: 'API_REQUESTS', sourceEventId: `api-usage:${event.id}`, sourceType: 'ApiUsageEvent', sourceId: event.id, subjectType: subject, subjectId, quantity: 1, quality: 'VERIFIED', occurredAt: event.createdAt });
    if (ingested) apiRequests++;
  }

  const hostingRecords = await prisma.hostingUsageRecord.findMany({ take: limit, orderBy: { createdAt: 'asc' } });
  for (const record of hostingRecords) {
    const website = await prisma.hostedWebsite.findUnique({ where: { id: record.websiteId }, select: { userId: true } });
    if (!website) continue;
    if (record.storageMb > 0) {
      const ingested = await ingestUsageEvent({ meterCode: 'HOSTING_STORAGE_MB', sourceEventId: `hosting-usage:${record.id}:storage`, sourceType: 'HostingUsageRecord', sourceId: record.id, subjectType: 'WEBSITE', subjectId: record.websiteId, quantity: record.storageMb, quality: record.isEstimated ? 'ESTIMATED' : 'VERIFIED', occurredAt: record.createdAt });
      if (ingested) storage++;
    }
    if (record.bandwidthMb > 0) {
      const ingested = await ingestUsageEvent({ meterCode: 'HOSTING_BANDWIDTH_MB', sourceEventId: `hosting-usage:${record.id}:bandwidth`, sourceType: 'HostingUsageRecord', sourceId: record.id, subjectType: 'WEBSITE', subjectId: record.websiteId, quantity: record.bandwidthMb, quality: record.isEstimated ? 'ESTIMATED' : 'VERIFIED', occurredAt: record.createdAt });
      if (ingested) bandwidth++;
    }
  }

  const succeededDeployments = await prisma.websiteDeployment.findMany({ where: { status: { in: ['READY', 'PUBLISHED'] } }, take: limit, orderBy: { createdAt: 'asc' } });
  for (const deployment of succeededDeployments) {
    const website = await prisma.hostedWebsite.findUnique({ where: { id: deployment.websiteId }, select: { userId: true } });
    if (!website) continue;
    const ingested = await ingestUsageEvent({ meterCode: 'DEPLOYMENTS', sourceEventId: `deployment:${deployment.id}`, sourceType: 'WebsiteDeployment', sourceId: deployment.id, subjectType: 'WEBSITE', subjectId: deployment.websiteId, quantity: 1, quality: 'VERIFIED', occurredAt: deployment.createdAt });
    if (ingested) deploymentCount++;
  }
  return { aiCredits, apiRequests, storage, bandwidth, deployments: deploymentCount };
}
