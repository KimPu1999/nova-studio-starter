import dns from 'node:dns';
import net from 'node:net';

export type ResolvedAddress = { address: string; family: number };

export type SafeUrlCheck = { ok: boolean; reason?: string };

const ALLOWED_PORTS = new Set([443, 8443]);
const MAX_REDIRECTS = 3;

/** IPv4 ranges that must never be contacted (loopback, private, link-local, metadata). */
function isPrivateIPv4(ip: string) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string) {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local + ULA
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

export function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) return isPrivateIPv4(address);
  if (net.isIPv6(address)) return isPrivateIPv6(address);
  return true; // unparseable → treat as unsafe
}

/** Pre-connection URL policy: HTTPS only, standard webhook ports, no credentials, HTTPS host. */
export function checkWebhookUrl(value: string): SafeUrlCheck {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: 'Invalid URL.' };
  }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Only HTTPS endpoints are allowed.' };
  if (!ALLOWED_PORTS.has(url.port ? Number(url.port) : 443)) return { ok: false, reason: 'Only ports 443 and 8443 are allowed.' };
  if (url.username || url.password) return { ok: false, reason: 'Credentials in URLs are not allowed.' };
  if (/[\0\r\n\t]/.test(value)) return { ok: false, reason: 'Invalid characters in URL.' };
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return { ok: false, reason: 'Internal hostnames are not allowed.' };
  }
  if (net.isIP(host) && isPrivateAddress(host)) return { ok: false, reason: 'Private IP endpoints are not allowed.' };
  return { ok: true };
}

export type ResolveFn = (hostname: string) => Promise<ResolvedAddress[]>;

export const defaultResolve: ResolveFn = (hostname) =>
  new Promise((resolve, reject) => {
    dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) reject(err);
      else resolve(addresses.map((a) => ({ address: a.address, family: a.family })));
    });
  });

/**
 * Resolves a hostname and rejects if any resolved address points at a private,
 * loopback, link-local or metadata network. Residual DNS-rebinding risk is
 * documented: production hardening should pin the connection to validated IPs.
 */
export async function resolveAndValidateHost(hostname: string, resolve: ResolveFn = defaultResolve): Promise<ResolvedAddress[]> {
  const addresses = await resolve(hostname);
  if (!addresses || addresses.length === 0) throw new Error('DNS_RESOLUTION_EMPTY');
  const bad = addresses.find((a) => isPrivateAddress(a.address));
  if (bad) throw new Error('DNS_RESOLVED_PRIVATE_ADDRESS');
  return addresses;
}

export type SafeFetchOptions = {
  url: string;
  body: Buffer;
  timeoutMs?: number;
  maxResponseBytes?: number;
  resolve?: ResolveFn;
};

export type SafeFetchResult = { ok: boolean; status?: number; errorKind?: string; durationMs: number };

/**
 * SSRF-hardened outbound POST:
 * - validates the URL policy and every resolved address before connecting,
 * - never follows redirects automatically (redirects are re-validated manually),
 * - enforces timeouts and a response size cap,
 * - revalidates each redirect target's host resolution before following.
 */
export async function safeWebhookFetch(options: SafeFetchOptions): Promise<SafeFetchResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxResponseBytes = options.maxResponseBytes ?? 64 * 1024;

  const first = checkWebhookUrl(options.url);
  if (!first.ok) return { ok: false, errorKind: 'URL_POLICY', durationMs: Date.now() - started };

  let currentUrl = options.url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    try {
      await resolveAndValidateHost(parsed.hostname, options.resolve);
    } catch (error) {
      return { ok: false, errorKind: error instanceof Error && error.message === 'DNS_RESOLVED_PRIVATE_ADDRESS' ? 'SSRF_BLOCKED' : 'DNS_FAILURE', durationMs: Date.now() - started };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(currentUrl, {
        method: 'POST',
        body: new Uint8Array(options.body),
        headers: { 'content-type': 'application/json', 'user-agent': 'NOVA-Studio-Webhooks/1.0' },
        redirect: 'manual',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return { ok: false, status: response.status, errorKind: 'REDIRECT_NO_LOCATION', durationMs: Date.now() - started };
        if (hop === MAX_REDIRECTS) return { ok: false, errorKind: 'TOO_MANY_REDIRECTS', durationMs: Date.now() - started };
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return { ok: false, errorKind: 'REDIRECT_INVALID', durationMs: Date.now() - started };
        }
        const nextCheck = checkWebhookUrl(currentUrl);
        if (!nextCheck.ok) return { ok: false, errorKind: 'REDIRECT_POLICY', durationMs: Date.now() - started };
        await options.body; // body is reused as-is
        continue;
      }

      // Drain at most maxResponseBytes, discarding the body.
      const reader = response.body?.getReader();
      if (reader) {
        let total = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > maxResponseBytes) { void reader.cancel(); break; }
        }
      }
      const ok = response.status >= 200 && response.status < 300;
      return { ok, status: response.status, durationMs: Date.now() - started };
    } catch (error) {
      clearTimeout(timer);
      const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
      return { ok: false, errorKind: aborted ? 'TIMEOUT' : 'NETWORK_ERROR', durationMs: Date.now() - started };
    }
  }
  return { ok: false, errorKind: 'TOO_MANY_REDIRECTS', durationMs: Date.now() - started };
}
