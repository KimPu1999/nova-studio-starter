import { authenticateApiRequest, apiOk, recordApiUsage } from '@/lib/api-v1';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) { const started = Date.now(); const auth = await authenticateApiRequest(request, 'ai_usage:read'); if (auth.response) return auth.response; const principal = auth.principal!; const usage = await prisma.aiUsageRecord.aggregate({ where: { userId: principal.userId }, _count: { id: true }, _sum: { creditsConsumed: true, inputTokens: true, outputTokens: true } }); await recordApiUsage(principal, request, 200, started); return apiOk({ records: usage._count.id, creditsConsumed: usage._sum.creditsConsumed ?? 0, inputTokens: usage._sum.inputTokens ?? null, outputTokens: usage._sum.outputTokens ?? null }, principal.requestId); }
