export const dynamic = 'force-static';

const releases = [
  {
    version: '2026-11-13',
    tag: 'Webhook event version',
    current: true,
    items: [
      'NOVA API v1 launched: projects, websites, deployments, marketplace, AI usage, workspaces and me endpoints.',
      'OAuth 2.0 authorization code flow with mandatory PKCE (S256 only), refresh token rotation and RFC 7009 token revocation.',
      'Webhooks with transactional outbox delivery, HMAC-SHA256 signatures, five-minute replay tolerance and exponential backoff (max 6 attempts, then dead-letter).',
      'Sandbox environment with nova_sb_ keys, isolated quotas and event simulation.',
      'Rate limiting (60/min per credential, 240/min per user), monthly workspace quota and Idempotency-Key support on deployment creation.',
      'Developer portal: API keys, OAuth apps, webhook endpoints with delivery timeline, sandbox console, usage analytics.',
    ],
  },
  {
    version: '2026-09-02',
    tag: 'Phase 16 preview',
    current: false,
    items: [
      'ApiCredential personal keys and workspace ServiceAccounts introduced (used by v1 auth).',
      'Credentials stored hashed; plaintext secrets shown exactly once at creation.',
    ],
  },
];

export default function ChangelogPage() {
  return (
    <main className="admin-content max-w-4xl">
      <p className="eyebrow">CHANGELOG</p>
      <h1 className="admin-title">API changelog.</h1>
      <p className="mt-2 text-sm text-slate-400">Breaking changes ship under a new webhook event version; additive changes appear here without a version bump.</p>
      <div className="mt-8 space-y-6">
        {releases.map((release) => (
          <section key={release.version} className="admin-panel">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-mono text-sm text-slate-100">{release.version}</h2>
              <span className="text-xs text-slate-500">{release.tag}</span>
              {release.current && <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200">Current</span>}
            </div>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-400">
              {release.items.map((item) => <li key={item} className="flex gap-2"><span className="text-violet-400">›</span><span>{item}</span></li>)}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
