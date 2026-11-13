import { z } from 'zod';
import crypto from 'node:crypto';
import { authenticateApiRequest, apiError, apiOk, pagination, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';
import { encryptSecret } from '@/lib/security/secrets';
import { checkWebhookUrl } from '@/lib/webhooks/safe-fetch';
import { webhookEventTypes, WEBHOOK_EVENT_VERSION } from '@/lib/webhooks/events';
import { prismaAudit } from '@/lib/api/audit';
import { hasWorkspacePermission } from '@/lib/workspaces';
import { WorkspaceMemberRole } from '@prisma/client';

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { limit, cursor } = pagination(request);
    const workspaceFilter = principal.workspaceId ? [principal.workspaceId] : null;
    const rows = await prisma.webhookEndpoint.findMany({
      where: { workspaceId: workspaceFilter ? { in: workspaceFilter } : undefined, workspace: workspaceFilter ? undefined : { members: { some: { userId: principal.userId } } } },
      select: { id: true, url: true, status: true, createdAt: true, workspace: { select: { id: true, name: true, slug: true } }, subscriptions: { select: { eventType: true, version: true, isActive: true } } },
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

const createBody = z.object({
  workspaceId: z.string().uuid(),
  url: z.string().min(12).max(2000),
  events: z.array(z.enum(webhookEventTypes)).min(1).max(9),
});

export async function POST(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const body = await request.json().catch(() => null);
    const parsed = createBody.safeParse(body);
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'workspaceId, url and at least one event type are required.', 400, principal.requestId);

    // Authorization: caller must manage the workspace; service accounts are
    // pinned to their own workspace and cannot target others.
    if (principal.kind === 'SERVICE_ACCOUNT') {
      if (parsed.data.workspaceId !== principal.workspaceId) return apiError('FORBIDDEN', 'Service accounts cannot manage webhooks outside their workspace.', 403, principal.requestId);
    } else {
      const membership = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: parsed.data.workspaceId, userId: principal.userId } } });
      if (!membership || !hasWorkspacePermission(membership.role as WorkspaceMemberRole, 'workspace.update')) {
        return apiError('FORBIDDEN', 'You cannot manage webhooks in this workspace.', 403, principal.requestId);
      }
    }

    const urlCheck = checkWebhookUrl(parsed.data.url);
    if (!urlCheck.ok) return apiError('VALIDATION_ERROR', urlCheck.reason || 'Endpoint URL rejected.', 400, principal.requestId);

    const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        url: parsed.data.url,
        secrets: { create: { secretCiphertext: encryptSecret(secret), version: 1 } },
        subscriptions: { create: parsed.data.events.map((eventType) => ({ eventType, version: WEBHOOK_EVENT_VERSION, isActive: true })) },
      },
      select: { id: true, url: true, status: true, createdAt: true, subscriptions: { select: { eventType: true, version: true, isActive: true } } },
    });

    await prismaAudit({ userId: principal.userId || null, workspaceId: parsed.data.workspaceId, action: 'webhook.endpoint.create', endpoint: new URL(request.url).pathname, requestId: principal.requestId, metadata: { webhookEndpointId: endpoint.id, events: parsed.data.events } });
    await recordApiUsage(principal, request, 201, started);
    // The signing secret is returned exactly once and never stored in plaintext.
    return apiOk({ ...endpoint, signingSecret: secret }, principal.requestId, 201);
  } finally {
    releaseAuthSlot(principal);
  }
}
