import { authenticateApiRequest, apiOk, recordApiUsage } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) { const started = Date.now(); const auth = await authenticateApiRequest(request, 'workspaces:read'); if (auth.response) return auth.response; const principal = auth.principal!; const rows = await prisma.workspaceMember.findMany({ where: { userId: principal.userId }, include: { workspace: { select: { id: true, name: true, slug: true, organization: { select: { id: true, name: true, slug: true } } } } }, take: 50, orderBy: { createdAt: 'desc' } }); const data = rows.map(row => ({ ...row.workspace, role: row.role })); await recordApiUsage(principal, request, 200, started); return apiOk(data, principal.requestId); }
