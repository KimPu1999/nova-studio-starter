/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Pin the workspace root: a stray package-lock.json in ~/ would otherwise be
  // picked as root, which breaks file tracing and can destabilize the dev cache.
  outputFileTracingRoot: import.meta.dirname,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        // HSTS is honored only over HTTPS; browsers ignore it on http://localhost,
        // so setting it unconditionally is safe for local development.
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    }];
  },
};
export default nextConfig;
