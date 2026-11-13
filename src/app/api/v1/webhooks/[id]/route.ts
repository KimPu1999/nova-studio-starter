import { z } from 'zod';
import crypto from 'node:crypto';
import { authenticateApiRequest, apiError, apiOk, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/security/secrets';
import { checkWebhookUrl } from '@/lib/webhooks/safe-fetch';
import { webhookEventTypes, WEBHOOK_EVENT_VERSION } from '@/lib/webhooks/events';
import { prismaAudit } from '@/lib/api/audit';
import { hasWorkspacePermission } from '@/lib/workspaces';
import { WorkspaceMemberRole } from '@prisma/client';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchBody = z.object({
  url: z.string().min(12).max(2000).optional(),
  events: z.array(z.enum(webhookEventTypes)).min(1).max(9).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

async function loadAuthorized(principal: { userId: string; workspaceId: string | null; kind: string }, id: string) {
  const endpoint = await prisma.webhookEndpoint.findUnique({ where: { id }, include: { workspace: { select: { id: true, members: { where: { userId: principal.userId }, select: { role: true } } } } } });
  if (!endpoint) return null;
  if (principal.kind === 'SERVICE_ACCOUNT') return principal.workspaceId === endpoint.workspaceId ? endpoint : null;
  const role = endpoint.workspace.members[0]?.role as WorkspaceMemberRole | undefined;
  if (!role || !hasWorkspacePermission(role, 'workspace.update')) return null;
  return endpoint;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    if (!uuid.test(id)) return apiError('INVALID_REQUEST', 'Invalid endpoint id.', 400, principal.requestId);
    const endpoint = await loadAuthorized(principal, id);
    if (!endpoint) return apiError('NOT_FOUND', 'Webhook endpoint not found or not managed by you.', 404, principal.requestId);
    const body = await request.json().catch(() => null);
    const parsed = patchBody.safeParse(body);
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Provide url, events and/or status.', 400, principal.requestId);

    if (parsed.data.url) {
      const urlCheck = checkWebhookUrl(parsed.data.url);
      if (!urlCheck.ok) return apiError('VALIDATION_ERROR', urlCheck.reason || 'Endpoint URL rejected.', 400, principal.requestId);
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: {
        ...(parsed.data.url ? { url: parsed.data.url } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.events ? {
          subscriptions: {
            deleteMany: {},
            create: parsed.data.events.map((eventType) => ({ eventType, version: WEBHOOK_EVENT_VERSION, isActive: true })),
          },
        } : {}),
      },
      select: { id: true, url: true, status: true, subscriptions: { select: { eventType: true, version: true, isActive: true } } },
    });
    await prismaAudit({ userId: principal.userId || null, workspaceId: endpoint.workspaceId, action: 'webhook.endpoint.update', requestId: principal.requestId, metadata: { webhookEndpointId: endpoint.id } });
    await recordApiUsage(principal, request, 200, started);
    return apiOk(updated, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}

/** Rotates the signing secret. The new secret is returned exactly once. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    if (!uuid.test(id)) return apiError('INVALID_REQUEST', 'Invalid endpoint id.', 400, principal.requestId);
    const endpoint = await loadAuthorized(principal, id);
    if (!endpoint) return apiError('NOT_FOUND', 'Webhook endpoint not found or not managed by you.', 404, principal.requestId);

    const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
    const latest = await prisma.webhookSigningSecret.findFirst({ where: { endpointId: endpoint.id, revokedAt: null }, orderBy: { version: 'desc' } });
    const nextVersion = (latest?.version ?? 0) + 1;
    await prisma.$transaction([
      prisma.webhookSigningSecret.updateMany({ where: { endpointId: endpoint.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.webhookSigningSecret.create({ data: { endpointId: endpoint.id, secretCiphertext: encryptSecret(secret), version: nextVersion } }),
    ]);
    await prismaAudit({ userId: principal.userId || null, workspaceId: endpoint.workspaceId, action: 'webhook.secret.rotate', requestId: principal.requestId, metadata: { webhookEndpointId: endpoint.id, version: nextVersion } });
    await recordApiUsage(principal, request, 201, started);
    return apiOk({ id: endpoint.id, signingSecretVersion: nextVersion, signingSecret: secret }, principal.requestId, 201);
  } finally {
    releaseAuthSlot(principal);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    if (!uuid.test(id)) return apiError('INVALID_REQUEST', 'Invalid endpoint id.', 400, principal.requestId);
    const endpoint = await loadAuthorized(principal, id);
    if (!endpoint) return apiError('NOT_FOUND', 'Webhook endpoint not found or not managed by you.', 404, principal.requestId);
    await prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { status: 'REVOKED' } });
    await prismaAudit({ userId: principal.userId || null, workspaceId: endpoint.workspaceId, action: 'webhook.endpoint.revoke', requestId: principal.requestId, metadata: { webhookEndpointId: endpoint.id } });
    await recordApiUsage(principal, request, 200, started);
    return apiOk({ id: endpoint.id, status: 'REVOKED' }, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}
