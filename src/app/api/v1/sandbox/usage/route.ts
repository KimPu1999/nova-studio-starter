import { authenticateApiRequest, apiError, apiOk, recordApiUsage, releaseAuthSlot, sandboxScopes } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'profile:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const sandbox = await prisma.developerSandbox.findUnique({ where: { id: principal.credentialId }, select: { id: true, name: true, quota: true, used: true, workspaceId: true, createdAt: true } });
    if (!sandbox) return apiError('NOT_FOUND', 'Sandbox not found.', 404, principal.requestId);
    await recordApiUsage(principal, request, 200, started);
    return apiOk({ id: sandbox.id, name: sandbox.name, workspaceId: sandbox.workspaceId, quotaMonthlyRequests: sandbox.quota, usedThisMonth: sandbox.used, remaining: Math.max(0, sandbox.quota - sandbox.used), scopes: sandboxScopes, environment: 'SANDBOX' }, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}
