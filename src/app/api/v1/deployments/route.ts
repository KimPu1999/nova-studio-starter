import crypto from 'node:crypto';
import { z } from 'zod';
import { authenticateApiRequest, apiError, apiOk, pagination, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';
import { idempotencyKeyFrom, beginIdempotentOperation } from '@/lib/api/idempotency';
import { websiteSchema } from '@/lib/ai/schema';

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'deployments:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { limit, cursor } = pagination(request);
    const rows = await prisma.websiteDeployment.findMany({
      where: { website: { userId: principal.userId, deletedAt: null } },
      select: { id: true, number: true, status: true, createdAt: true, publishedAt: true, website: { select: { id: true, name: true, slug: true } } },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit);
    await recordApiUsage(principal, request, 200, started);
    return apiOk({ items: data, nextCursor: hasMore ? data[data.length - 1]?.id : null }, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}

const createDeploymentBody = z.object({ websiteId: z.string().uuid() });

export async function POST(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'deployments:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const body = await request.json().catch(() => null);
    const parsed = createDeploymentBody.safeParse(body);
    if (!parsed.success) return apiError('INVALID_REQUEST', 'websiteId is required and must be a UUID.', 400, principal.requestId);

    const site = await prisma.hostedWebsite.findFirst({ where: { id: parsed.data.websiteId, userId: principal.userId, deletedAt: null }, include: { project: true } });
    if (!site) return apiError('NOT_FOUND', 'Website not found or not owned by you.', 404, principal.requestId);

    const parsedSchema = websiteSchema.safeParse(site.project.schema);
    if (!parsedSchema.success) return apiError('INVALID_REQUEST', 'The website schema is not deployable.', 400, principal.requestId);
    const latest = await prisma.aiWebsiteRevision.findFirst({ where: { projectId: site.projectId }, orderBy: { version: 'desc' } });
    if (!latest) return apiError('INVALID_REQUEST', 'The website has no revisions to deploy.', 400, principal.requestId);

    const idemKey = idempotencyKeyFrom(request);
    const principalKey = `${principal.kind}:${principal.credentialId}`;
    if (!idemKey) return apiError('INVALID_REQUEST', 'An Idempotency-Key header is required for deployment requests.', 400, principal.requestId);

    const guard = await beginIdempotentOperation<{ id: string }>(principalKey, 'deployments.create', idemKey, JSON.stringify(parsed.data));
    if (guard.kind === 'REPLAY') { await recordApiUsage(principal, request, guard.statusCode, started); return apiOk(guard.response, principal.requestId, guard.statusCode); }
    if (guard.kind === 'CONFLICT') return apiError('IDEMPOTENCY_CONFLICT', guard.message, 409, principal.requestId);
    if (guard.kind === 'LOCKED') return apiError('RESOURCE_LOCKED', guard.message, 409, principal.requestId);

    try {
      const deployment = await prisma.$transaction(async (tx) => {
        const last = await tx.websiteDeployment.findFirst({ where: { websiteId: site.id }, orderBy: { number: 'desc' }, select: { number: true } });
        return tx.websiteDeployment.create({
          data: { websiteId: site.id, revisionId: latest.id, number: (last?.number ?? 0) + 1, status: 'QUEUED', snapshot: parsedSchema.data, idempotencyKey: crypto.randomUUID(), logs: { create: { level: 'INFO', message: 'Queued via NOVA API.' } } },
        });
      });
      const responseBody = { id: deployment.id, number: deployment.number, status: deployment.status, websiteId: site.id, createdAt: deployment.createdAt };
      await guard.complete(201, responseBody);
      await recordApiUsage(principal, request, 201, started);
      return apiOk(responseBody, principal.requestId, 201);
    } catch (error) {
      await guard.fail();
      throw error;
    } finally {
      guard.release();
    }
  } finally {
    releaseAuthSlot(principal);
  }
}
