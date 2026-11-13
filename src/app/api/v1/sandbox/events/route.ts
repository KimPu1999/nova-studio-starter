import { z } from 'zod';
import { authenticateApiRequest, apiError, apiOk, pagination, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';
import { enqueueWebhookEvent, webhookEventTypes, triggerDeliveryKick, WEBHOOK_EVENT_VERSION, WebhookEventType } from '@/lib/webhooks/events';
import { prismaAudit } from '@/lib/api/audit';

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { limit, cursor } = pagination(request);
    const workspaceId = principal.workspaceId;
    if (!workspaceId) return apiError('INVALID_REQUEST', 'This sandbox is not linked to a workspace.', 400, principal.requestId);
    const rows = await prisma.webhookEvent.findMany({
      where: { workspaceId, version: WEBHOOK_EVENT_VERSION, payload: { path: ['environment'], equals: 'SANDBOX' } },
      select: { id: true, eventId: true, eventType: true, version: true, payload: true, createdAt: true },
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

const simulateBody = z.object({
  eventType: z.enum(webhookEventTypes),
  data: z.record(z.string(), z.unknown()).default({}),
});

/**
 * Sandbox-only event simulation. Creates a clearly-labelled SANDBOX event that
 * is delivered only to the sandbox workspace's webhook endpoints. Sandbox
 * events never touch production records: no orders, payments, entitlements or
 * deployments are created or modified by this endpoint.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'webhooks:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const body = await request.json().catch(() => null);
    const parsed = simulateBody.safeParse(body);
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'eventType must be one of the supported events; data must be an object.', 400, principal.requestId);
    const workspaceId = principal.workspaceId;
    if (!workspaceId) return apiError('INVALID_REQUEST', 'This sandbox is not linked to a workspace; create a workspace-linked sandbox to simulate deliveries.', 400, principal.requestId);

    const event = await enqueueWebhookEvent(workspaceId, parsed.data.eventType as WebhookEventType, {
      sandboxSandboxId: principal.credentialId,
      ...parsed.data.data,
    }, { environment: 'SANDBOX', simulate: true });

    await prismaAudit({ userId: principal.userId, workspaceId, action: 'sandbox.event.simulate', requestId: principal.requestId, metadata: { eventId: event.eventId, eventType: parsed.data.eventType } });
    await recordApiUsage(principal, request, 202, started);
    if (event.deliveryCount > 0) triggerDeliveryKick();
    return apiOk({ eventId: event.eventId, eventType: parsed.data.eventType, simulated: true, environment: 'SANDBOX', deliveryCount: event.deliveryCount }, principal.requestId, 202);
  } finally {
    releaseAuthSlot(principal);
  }
}
