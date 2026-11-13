import { NextResponse } from 'next/server';
import { processTokenRequest, OAuthErrors } from '@/lib/api/oauth';
import { prismaAudit } from '@/lib/api/audit';

export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') || '';
  let form: Record<string, string> = {};
  if (contentType.includes('application/json')) {
    form = (await request.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const params = new URLSearchParams(await request.text().catch(() => ''));
    form = Object.fromEntries(params.entries());
  }

  // Client authentication: HTTP Basic preferred, body fallback (RFC 6749 §2.3.1).
  let clientSecret: string | null = form.client_secret ?? null;
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      form.client_id = decodeURIComponent(decoded.slice(0, idx));
      clientSecret = decodeURIComponent(decoded.slice(idx + 1));
    } catch {
      return NextResponse.json(OAuthErrors.invalidClient(), { status: 401, headers: { 'cache-control': 'no-store' } });
    }
  }

  const result = await processTokenRequest({
    grantType: form.grant_type || '',
    code: form.code ?? null,
    redirectUri: form.redirect_uri ?? null,
    clientId: form.client_id || '',
    clientSecret,
    codeVerifier: form.code_verifier ?? null,
    refreshToken: form.refresh_token ?? null,
  });

  if (result.kind === 'ERROR') {
    await prismaAudit({ action: 'oauth.token_error', metadata: { clientId: form.client_id, error: result.body.error, grantType: form.grant_type } });
    return NextResponse.json(result.body, { status: result.status, headers: { 'cache-control': 'no-store' } });
  }

  return NextResponse.json(
    { access_token: result.accessToken, token_type: result.tokenType, expires_in: result.expiresIn, refresh_token: result.refreshToken, scope: result.scope },
    { status: 200, headers: { 'cache-control': 'no-store', 'pragma': 'no-cache' } },
  );
}
