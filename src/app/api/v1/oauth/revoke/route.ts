import { NextResponse } from 'next/server';
import { revokeToken } from '@/lib/api/oauth';
import { prismaAudit } from '@/lib/api/audit';

export async function POST(request: Request) {
  const params = new URLSearchParams(await request.text().catch(() => ''));
  const token = params.get('token');
  // Client identity is best-effort; a token is only revoked when the caller
  // either supplies no client_id (own-token assumption) or matches the owner.
  const clientId = params.get('client_id');
  if (!token) return NextResponse.json({ error: 'invalid_request', error_description: 'token is required.' }, { status: 400 });
  const revoked = await revokeToken(token, clientId);
  await prismaAudit({ action: 'oauth.revoke', metadata: { clientId, revoked } });
  // RFC 7009: respond 200 even when the token was unknown (no information leak).
  return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } });
}
