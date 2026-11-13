import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { clampScopes, parseScopeParam, redirectUriAllowed } from '@/lib/api/oauth';
import { grantConsentAction } from './actions';

export const dynamic = 'force-dynamic';

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'profile:read': 'Read your name, email and account details.',
  'workspaces:read': 'List the workspaces you belong to.',
  'projects:read': 'List and read workspace projects you can access.',
  'projects:write': 'Create projects in workspaces where you are a member.',
  'websites:read': 'List and read your hosted websites.',
  'deployments:read': 'View deployment status for your websites.',
  'deployments:write': 'Request new deployments for your websites.',
  'marketplace:read': 'Browse the public product catalog.',
  'ai_usage:read': 'View your AI credit usage totals.',
  'webhooks:read': 'List webhook endpoints and deliveries.',
  'webhooks:write': 'Manage webhook endpoints for your workspaces.',
};

function SearchParamError({ error, description }: { error: string; description: string }) {
  return <main className="container-wide page-pad max-w-xl"><div className="rounded-2xl border border-red-400/30 bg-red-400/5 p-6"><h1 className="text-lg font-semibold text-red-300">Authorization error</h1><p className="mt-2 text-sm text-slate-300">{description}</p><p className="mt-4 text-xs text-slate-500">error={error}</p></div></main>;
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const get = (k: string) => (typeof params[k] === 'string' ? params[k] as string : Array.isArray(params[k]) ? params[k]![0] : undefined);

  const clientId = get('client_id');
  const redirectUri = get('redirect_uri');
  const responseType = get('response_type');
  const scopeParam = get('scope') || '';
  const state = get('state') || '';
  const codeChallenge = get('code_challenge');
  const challengeMethod = get('code_challenge_method');

  if (!clientId || !redirectUri || responseType !== 'code' || !codeChallenge) {
    return <SearchParamError error="invalid_request" description="client_id, redirect_uri, response_type=code and code_challenge (PKCE S256) are required." />;
  }
  const client = await prisma.oAuthClient.findUnique({ where: { clientId }, select: { id: true, redirectUris: true, scopes: true, status: true, application: { select: { name: true, status: true, user: { select: { name: true } } } } } });
  if (!client || client.status !== 'ACTIVE' || client.application.status !== 'ACTIVE') {
    return <SearchParamError error="unauthorized_client" description="This application is not available." />;
  }
  if (!redirectUriAllowed(client.redirectUris, redirectUri)) {
    return <SearchParamError error="invalid_request" description="The redirect URI does not exactly match one registered for this application." />;
  }
  const granted = clampScopes(parseScopeParam(scopeParam), client.scopes);
  if (granted.length === 0) {
    return <SearchParamError error="invalid_scope" description="None of the requested scopes are available for this application." />;
  }
  if (challengeMethod && challengeMethod !== 'S256') {
    return <SearchParamError error="invalid_request" description="Only the S256 PKCE challenge method is supported." />;
  }

  const workspaces = await prisma.workspaceMember.findMany({ where: { userId: user.id }, select: { workspace: { select: { id: true, name: true } } }, take: 20 });

  return (
    <main className="container-wide page-pad max-w-xl">
      <span className="eyebrow">AUTHORIZATION REQUEST</span>
      <h1 className="page-title text-2xl">Authorize <span className="gradient-text">{client.application.name}</span></h1>
      <p className="page-description text-sm">by {client.application.user.name}. This application is requesting access to:</p>
      <ul className="mt-6 space-y-3">
        {granted.map((scope) => (
          <li key={scope} className="rounded-xl border border-white/10 bg-surface p-4 text-sm">
            <p className="font-mono text-xs text-cyan-300">{scope}</p>
            <p className="mt-1 text-slate-400">{SCOPE_DESCRIPTIONS[scope] || 'Access to the NOVA API.'}</p>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-slate-500">Signing in as <span className="text-slate-300">{user.email}</span>. You can revoke access any time from <span className="text-violet-300">/developers/integrations</span>.</p>
      <form action={grantConsentAction} className="mt-8 space-y-4">
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="scope" value={granted.join(' ')} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <div>
          <label htmlFor="workspaceId" className="label">Workspace scope (optional)</label>
          <select id="workspaceId" name="workspaceId" className="input">
            <option value="">All my data (personal scope)</option>
            {workspaces.map((m) => <option key={m.workspace.id} value={m.workspace.id}>{m.workspace.name}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <button type="submit" name="decision" value="allow" className="btn-primary">Allow access</button>
          <button type="submit" name="decision" value="deny" className="btn-outline">Deny</button>
        </div>
      </form>
    </main>
  );
}
