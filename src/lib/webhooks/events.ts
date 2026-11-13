import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { decryptSecret } from '../security/secrets';

export const webhookEventTypes = [
  'project.created',
  'project.updated',
  'website.published',
  'deployment.completed',
  'deployment.failed',
  'order.paid',
  'order.refunded',
  'ai.credits.low',
  'workspace.member.invited',
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];
export const WEBHOOK_EVENT_VERSION = '2026-11-13';
export const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024;

export type WebhookEventPayload = Record<string, unknown>;

/**
 * Transactional outbox: the event row AND one delivery row per matching
 * endpoint are created in a single transaction, so an event is never lost if
 * the process dies before dispatch. Delivery rows start PENDING and are
 * processed by the delivery engine (at-least-once).
 */
export async function enqueueWebhookEvent(
  workspaceId: string,
  eventType: WebhookEventType,
  payload: WebhookEventPayload,
  options: { environment?: 'PRODUCTION' | 'SANDBOX'; simulate?: boolean } = {},
) {
  const eventId = `evt_${crypto.randomUUID()}`;
  const version = WEBHOOK_EVENT_VERSION;
  const body = {
    id: eventId,
    type: eventType,
    version,
    created_at: new Date().toISOString(),
    environment: options.environment ?? 'PRODUCTION',
    simulated: Boolean(options.simulate),
    data: payload,
  };

  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      workspaceId,
      status: 'ACTIVE',
      subscriptions: { some: { eventType, isActive: true, version } },
    },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.webhookEvent.create({ data: { eventId, workspaceId, eventType, version, payload: body as unknown as Prisma.InputJsonValue } }),
    ...endpoints.map((endpoint) =>
      prisma.webhookDelivery.create({ data: { eventId, endpointId: endpoint.id, status: 'PENDING' } }),
    ),
  ]);

  return { eventId, deliveryCount: endpoints.length };
}

/**
 * Fires the first delivery attempt inline (fire-and-forget). Durable retries
 * are handled by processWebhookDeliveries(), which should run on a worker or
 * be invoked periodically by infrastructure.
 */
export function triggerDeliveryKick() {
  void processWebhookDeliveries(20).catch(() => undefined);
}

/**
 * Fire-and-forget emit for existing platform flows: never throws, never
 * blocks the surrounding transaction. Events are stored durably first, so a
 * dispatch failure does not lose them.
 */
export function emitWebhookEventSafely(workspaceId: string | null, eventType: WebhookEventType, payload: WebhookEventPayload) {
  if (!workspaceId) return;
  void enqueueWebhookEvent(workspaceId, eventType, payload).then(() => triggerDeliveryKick()).catch(() => undefined);
}

const BACKOFF_SCHEDULE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 8 * 3600_000, 24 * 3600_000];
const MAX_ATTEMPTS = BACKOFF_SCHEDULE_MS.length + 1;
const ENDPOINT_PER_MINUTE_LIMIT = 120;

/**
 * Delivery engine: claims PENDING/RETRYING deliveries that are due, signs the
 * stored event payload, and records an attempt row per HTTP attempt. A
 * delivery is DEAD_LETTERED after the retry schedule is exhausted.
 */
export async function processWebhookDeliveries(limit = 50, now = new Date()) {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: { in: ['PENDING', 'RETRYING'] }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { event: true, endpoint: { include: { secrets: { where: { revokedAt: null }, orderBy: { version: 'desc' }, take: 1 } } } },
  });

  let delivered = 0;
  let failed = 0;

  for (const delivery of due) {
    // Prevent concurrent duplicate dispatch of the same delivery.
    const claimed = await prisma.webhookDelivery.updateMany({
      where: { id: delivery.id, attemptCount: delivery.attemptCount, status: { in: ['PENDING', 'RETRYING'] } },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: now },
    });
    if (claimed.count === 0) continue;

    const attemptNumber = delivery.attemptCount + 1;
    const secret = delivery.endpoint.secrets[0];
    if (!secret) {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'DEAD_LETTER' } }).catch(() => undefined);
      continue;
    }

    // Per-endpoint rate limit (protects consumer infrastructure).
    const endpointRate = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `INSERT INTO "ApiRateCounter" (id, scope, key, "windowStart", count, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), 'webhook', $1, date_trunc('minute', now()), 1, now(), now())
       ON CONFLICT (scope, key, "windowStart") DO UPDATE SET count = "ApiRateCounter".count + 1, "updatedAt" = now()
       RETURNING count`,
      delivery.endpointId,
    ).catch(() => [{ count: BigInt(0) }]);
    if (Number(endpointRate[0]?.count ?? 0) > ENDPOINT_PER_MINUTE_LIMIT) {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'RETRYING', nextAttemptAt: new Date(now.getTime() + 60_000), attemptCount: { decrement: 1 } } }).catch(() => undefined);
      continue;
    }

    const rawBody = Buffer.from(JSON.stringify(delivery.event.payload), 'utf8');
    if (rawBody.byteLength > MAX_WEBHOOK_PAYLOAD_BYTES) {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED' } }).catch(() => undefined);
      failed++;
      continue;
    }

    const timestamp = Math.floor(now.getTime() / 1000);
    const { signWebhookPayload } = await import('./signature');
    let signingSecret: string;
    try {
      signingSecret = decryptSecret(secret.secretCiphertext);
    } catch {
      await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: 'DEAD_LETTER' } }).catch(() => undefined);
      continue;
    }
    const signature = signWebhookPayload(rawBody.toString('utf8'), signingSecret, timestamp, delivery.event.eventId);

    const { safeWebhookFetch } = await import('./safe-fetch');
    const result = await safeWebhookFetch({ url: delivery.endpoint.url, body: rawBody });

    await prisma.webhookDeliveryAttempt.create({
      data: {
        deliveryId: delivery.id,
        attemptNumber,
        ok: result.ok,
        statusCode: result.status ?? null,
        errorKind: result.errorKind ?? null,
        durationMs: result.durationMs ?? null,
      },
    }).catch(() => undefined);

    if (result.ok) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), lastStatusCode: result.status ?? null },
      }).catch(() => undefined);
      delivered++;
    } else if (attemptNumber >= MAX_ATTEMPTS) {
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'DEAD_LETTER', lastStatusCode: result.status ?? null },
      }).catch(() => undefined);
      failed++;
    } else {
      const backoff = BACKOFF_SCHEDULE_MS[attemptNumber - 1] ?? BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1];
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: 'RETRYING', nextAttemptAt: new Date(now.getTime() + backoff), lastStatusCode: result.status ?? null },
      }).catch(() => undefined);
      failed++;
    }
  }

  return { processed: due.length, delivered, failed };
}

/** Manual retry from the portal/admin: reactivates a dead-lettered delivery. */
export async function retryDelivery(deliveryId: string, workspaceId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, event: { workspaceId } } });
  if (!delivery) return null;
  return prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: 'RETRYING', nextAttemptAt: new Date(), attemptCount: 0 },
  });
}
