import { authenticateApiRequest, apiOk, recordApiUsage } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) { const started = Date.now(); const auth = await authenticateApiRequest(request, 'websites:read'); if (auth.response) return auth.response; const principal = auth.principal!; const websites = await prisma.hostedWebsite.findMany({ where: { userId: principal.userId, deletedAt: null }, select: { id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true, domains: { where: { isPrimary: true }, select: { hostname: true, status: true }, take: 1 } }, take: 50, orderBy: { updatedAt: 'desc' } }); await recordApiUsage(principal, request, 200, started); return apiOk(websites, principal.requestId); }
