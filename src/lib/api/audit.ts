import { prisma } from '../prisma';

export type ApiAuditEntry = {
  userId?: string | null;
  workspaceId?: string | null;
  action: string;
  endpoint?: string | null;
  requestId?: string | null;
  metadata?: object;
};

/** Sensitive developer-platform audit trail. Never store credentials here. */
export async function prismaAudit(entry: ApiAuditEntry) {
  await prisma.apiAuditLog.create({
    data: {
      userId: entry.userId ?? null,
      workspaceId: entry.workspaceId ?? null,
      action: entry.action,
      endpoint: entry.endpoint ?? null,
      requestId: entry.requestId ?? null,
      metadata: (entry.metadata ?? undefined) as object,
    },
  }).catch(() => undefined);
}
