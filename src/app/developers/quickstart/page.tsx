export const dynamic = 'force-static';

const curl = `curl -s https://your-domain.example/api/v1/me \\
  -H "Authorization: Bearer $NOVA_API_KEY"`;

const sdk = `import { NovaApiClient } from '@/lib/developer-sdk';

const nova = new NovaApiClient({
  baseUrl: 'https://your-domain.example',
  apiKey: process.env.NOVA_API_KEY,   // server-side only
});

const { data: me } = await nova.me();
const { data: first } = await nova.projects({ limit: 20 });`;

const webhook = `import { verifyWebhookSignature } from '@/lib/webhooks/signature';

const ok = verifyWebhookSignature(
  rawBody,                      // exact bytes as received
  process.env.NOVA_WEBHOOK_SECRET!,
  Number(headers['nova-timestamp']),
  headers['nova-event-id'],
  headers['nova-signature'],
);
if (!ok) return new Response(null, { status: 400 });`;

export default function QuickstartPage() {
  return (
    <main className="admin-content max-w-4xl">
      <p className="eyebrow">QUICKSTART</p>
      <h1 className="admin-title">Make your first request.</h1>

      <ol className="mt-8 space-y-6 text-sm text-slate-400">
        <li className="admin-panel">
          <h2 className="font-semibold">1. Create a scoped API key</h2>
          <p className="mt-2 leading-6">Generate it in <span className="font-mono text-xs text-cyan-200">/developers/api-keys</span>. The plaintext key is shown exactly once; store it in a server-side secret manager. Keys are stored hashed and can be revoked instantly.</p>
        </li>
        <li className="admin-panel">
          <h2 className="font-semibold">2. Call the API</h2>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#09090F] p-5 text-xs text-cyan-100"><code>{curl}</code></pre>
        </li>
        <li className="admin-panel">
          <h2 className="font-semibold">3. Or use the TypeScript SDK</h2>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#09090F] p-5 text-xs text-cyan-100"><code>{sdk}</code></pre>
        </li>
        <li className="admin-panel">
          <h2 className="font-semibold">4. Receive webhooks</h2>
          <p className="mt-2 leading-6">Register an HTTPS endpoint (port 443 or 8443) and store the <span className="font-mono text-xs">whsec_…</span> signing secret shown at creation. Verify every delivery before trusting it:</p>
          <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-[#09090F] p-5 text-xs text-cyan-100"><code>{webhook}</code></pre>
        </li>
        <li className="admin-panel">
          <h2 className="font-semibold">5. Experiment safely in the sandbox</h2>
          <p className="mt-2 leading-6">A <span className="font-mono text-xs">nova_sb_</span> key gets its own quota and can simulate webhook events at <span className="font-mono text-xs text-cyan-200">/developers/sandbox</span> without touching production data.</p>
        </li>
      </ol>

      <p className="mt-8 text-sm leading-7 text-slate-400">Never ship an API key in browser JavaScript or commit one to source control. Mutations like deployment creation require an <span className="font-mono text-xs">Idempotency-Key</span> header so network retries can never double-deploy.</p>
    </main>
  );
}
