'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { createAuthorization, redirectUriAllowed } from '@/lib/api/oauth';
import { prismaAudit } from '@/lib/api/audit';

export async function grantConsentAction(formData: FormData) {
  const user = await requireUser();
  const decision = String(formData.get('decision') || 'deny');
  const clientId = String(formData.get('client_id') || '');
  const redirectUri = String(formData.get('redirect_uri') || '');
  const state = String(formData.get('state') || '');
  const codeChallenge = String(formData.get('code_challenge') || '');
  const workspaceRaw = String(formData.get('workspaceId') || '');
  const scope = String(formData.get('scope') || '').split(/\s+/).filter(Boolean);

  // Open-redirect guard: every redirect (allow AND deny paths) may only target
  // a redirect URI that is exactly registered for this client. A forged form
  // value can never bounce the user (or an error/state payload) elsewhere.
  let target: URL | null = null;
  try {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { redirectUris: true } });
    if (client && redirectUriAllowed(client.redirectUris, redirectUri)) target = new URL(redirectUri);
  } catch {
    target = null;
  }

  const build = (params: Record<string, string>) => {
    if (!target) redirect('/oauth/authorize?error=invalid_request');
    const url = new URL(target.toString());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
  };

  if (decision !== 'allow') {
    redirect(build(state ? { error: 'access_denied', state } : { error: 'access_denied' }));
  }

  // Workspace binding is validated against the user's own memberships — a
  // client can never request a workspace the user has not chosen here.
  let workspaceId: string | null = null;
  if (workspaceRaw) {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspaceId: workspaceRaw } });
    if (membership) workspaceId = membership.workspaceId;
  }

  const result = await createAuthorization({ clientId, redirectUri, scope, codeChallenge, challengeMethod: 'S256' }, user.id, workspaceId);
  if (!result.ok) {
    redirect(build(state ? { error: result.error, state } : { error: result.error }));
  }

  const code = result.code;
  await prismaAudit({ userId: user.id, workspaceId, action: 'oauth.grant', metadata: { clientId, scopes: result.granted } });
  redirect(build(state ? { code, state } : { code }));
}
