import { authenticateApiRequest, apiError, apiOk, recordApiUsage, releaseAuthSlot } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = Date.now();
  const auth = await authenticateApiRequest(request, 'deployments:read');
  if (auth.response) return auth.response;
  const principal = auth.principal!;
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return apiError('INVALID_REQUEST', 'Invalid deployment id.', 400, principal.requestId);
    const deployment = await prisma.websiteDeployment.findFirst({
      where: { id, website: { userId: principal.userId, deletedAt: null } },
      select: { id: true, number: true, status: true, createdAt: true, publishedAt: true, website: { select: { id: true, name: true, slug: true } }, logs: { orderBy: { createdAt: 'asc' }, select: { level: true, message: true, createdAt: true } } },
    });
    if (!deployment) return apiError('NOT_FOUND', 'Deployment not found.', 404, principal.requestId);
    await recordApiUsage(principal, request, 200, started);
    return apiOk(deployment, principal.requestId);
  } finally {
    releaseAuthSlot(principal);
  }
}
