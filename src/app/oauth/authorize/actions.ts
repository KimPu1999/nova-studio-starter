'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { createAuthorization } from '@/lib/api/oauth';
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

  const build = (params: Record<string, string>) => {
    const url = new URL(redirectUri);
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
