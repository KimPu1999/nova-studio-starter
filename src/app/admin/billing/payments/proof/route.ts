import { NextResponse } from 'next/server';
import { getPrivateFile } from '@/lib/private-storage';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Serves a payment-proof file. Payment proofs are PRIVATE: only finance
 * reviewers (SUPER_ADMIN / FINANCE_ADMIN) may open them — never customers,
 * never other tenants. The key is validated inside getPrivateFile.
 */
export async function GET(request: Request) {
  const user = await requireAdmin(['SUPER_ADMIN', 'FINANCE_ADMIN']);
  const key = new URL(request.url).searchParams.get('key') ?? '';
  if (!key) return new NextResponse('Missing key', { status: 400 });
  try {
    const bytes = await getPrivateFile(key);
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : 'image/jpeg';
    return new NextResponse(new Uint8Array(bytes), { headers: { 'content-type': contentType, 'cache-control': 'private, no-store' } });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
