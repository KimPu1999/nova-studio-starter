import Link from 'next/link';

export default function DevelopersPage() {
  return (
    <main className="admin-content max-w-4xl">
      <p className="eyebrow">NOVA DEVELOPER PLATFORM</p>
      <h1 className="admin-title">Build with the <span className="gradient-text">NOVA API.</span></h1>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">Versioned, scoped access to your workspace data. Authenticate with an API key, OAuth 2.0 or an isolated sandbox credential; receive signed webhook events for the things that matter. Payment approval operations are not exposed through the public API.</p>

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        <Link href="/developers/quickstart" className="quick-action"><span>Quickstart — first request in five minutes</span><span aria-hidden>›</span></Link>
        <Link href="/developers/docs" className="quick-action"><span>API reference — auth, errors, limits, webhooks</span><span aria-hidden>›</span></Link>
        <Link href="/developers/api-keys" className="quick-action"><span>Create an API key</span><span aria-hidden>›</span></Link>
        <Link href="/developers/sandbox" className="quick-action"><span>Try it safely in the sandbox</span><span aria-hidden>›</span></Link>
        <Link href="/developers/webhooks" className="quick-action"><span>Webhook endpoints &amp; deliveries</span><span aria-hidden>›</span></Link>
        <Link href="/developers/usage" className="quick-action"><span>Usage analytics &amp; quota</span><span aria-hidden>›</span></Link>
      </div>

      <section className="admin-panel mt-8">
        <h2 className="font-semibold">Current release</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">API v1 is read-focused with scoped writes (projects, deployments, webhooks). Webhook event version <span className="font-mono text-xs text-cyan-200">2026-11-13</span>. See the <Link href="/developers/changelog" className="text-violet-300 hover:text-violet-200">changelog</Link> for what shipped and what is coming.</p>
      </section>
    </main>
  );
}
