import { authenticateApiRequest, apiOk, recordApiUsage } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) { const started = Date.now(); const auth = await authenticateApiRequest(request, 'profile:read'); if (auth.response) return auth.response; const principal = auth.principal!; const user = await prisma.user.findUnique({ where: { id: principal.userId }, select: { id: true, name: true, email: true, createdAt: true, role: { select: { code: true, name: true } } } }); if (!user) return new Response(null, { status: 401 }); await recordApiUsage(principal, request, 200, started); return apiOk(user, principal.requestId); }
