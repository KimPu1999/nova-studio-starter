import { z } from 'zod';
import { authenticateApiRequest, apiError, apiOk, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';
import { emitWebhookEventSafely } from '@/lib/webhooks/events';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'projects:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    const project = await prisma.workspaceProject.findFirst({
      where: { id, workspace: { members: { some: { userId: principal.userId } } } },
      include: {
        aiProject: { select: { id: true, name: true, description: true, schema: true, schemaVersion: true, updatedAt: true } },
        workspace: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!project) return apiError('NOT_FOUND', 'Project not found.', 404, principal.requestId);
    await recordApiUsage(principal, request, 200, started);
    return apiOk(project, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}

const patchBody = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(2000).optional() }).refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required.' });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'projects:write');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return apiError('INVALID_REQUEST', 'Invalid project id.', 400, principal.requestId);
    const body = await request.json().catch(() => null);
    const parsed = patchBody.safeParse(body);
    if (!parsed.success) return apiError('VALIDATION_ERROR', 'Provide a name (1-120 chars) and/or description (max 2000 chars).', 400, principal.requestId);

    // Ownership: the AI project must belong to the caller; the caller must be
    // a member of the workspace it is shared with. Service accounts (bound to
    // one workspace) can only edit projects inside that workspace.
    const shared = await prisma.workspaceProject.findFirst({
      where: { aiProjectId: id, ...(principal.kind === 'SERVICE_ACCOUNT' ? { workspaceId: principal.workspaceId! } : {}) },
      select: { id: true, workspaceId: true, createdById: true },
    });
    if (shared) {
      const isService = principal.kind === 'SERVICE_ACCOUNT';
      const membership = isService ? null : await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: shared.workspaceId, userId: principal.userId } } });
      const allowed = isService ? ['EDITOR', 'DEVELOPER', 'MANAGER', 'ADMIN', 'OWNER'] : membership ? ['OWNER', 'ADMIN', 'MANAGER', 'EDITOR', 'DEVELOPER'] : [];
      if (!allowed.length) return apiError('FORBIDDEN', 'You do not have permission to update this project.', 403, principal.requestId);
    } else {
      const owned = await prisma.aiWebsiteProject.findFirst({ where: { id, userId: principal.userId } });
      if (!owned) return apiError('NOT_FOUND', 'Project not found.', 404, principal.requestId);
    }

    const updated = await prisma.aiWebsiteProject.update({
      where: { id },
      data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}) },
      select: { id: true, name: true, description: true, updatedAt: true },
    });
    emitWebhookEventSafely(shared ? shared.workspaceId : null, 'project.updated', { projectId: id, name: updated.name, updatedAt: updated.updatedAt.toISOString() });
    await recordApiUsage(principal, request, 200, started);
    return apiOk(updated, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}
