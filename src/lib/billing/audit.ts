/**
 * Phase 18 — append-only billing audit log + notifications helpers.
 * Financial actions must always be auditable; failures here must never
 * abort a financial transaction, so audit writes are best-effort.
 */
import { prisma } from '@/lib/prisma';

export interface BillingAuditEntry {
  actorId?: string | null;
  accountId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}

export async function billingAudit(entry: BillingAuditEntry): Promise<void> {
  try {
    await prisma.billingAuditLog.create({
      data: {
        actorId: entry.actorId ?? undefined,
        accountId: entry.accountId ?? undefined,
        entityType: entry.entityType,
        entityId: entry.entityId ?? undefined,
        action: entry.action,
        before: (entry.before ?? undefined) as never,
        after: (entry.after ?? undefined) as never,
        metadata: (entry.metadata ?? undefined) as never,
      },
    });
  } catch {
    // Audit is best-effort; never block a financial transition.
  }
}

export async function billingNotify(
  userId: string,
  type: string,
  title: string,
  body: string,
  href?: string,
): Promise<void> {
  try {
    await prisma.notification.create({ data: { userId, type, title, body, href } });
  } catch {
    // Non-fatal.
  }
}
