import { describe, expect, it } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature, isSafeWebhookUrl } from '../src/lib/webhooks/signature';
import { checkWebhookUrl, isPrivateAddress, resolveAndValidateHost, defaultResolve } from '../src/lib/webhooks/safe-fetch';
import { webhookEventTypes, WEBHOOK_EVENT_VERSION, MAX_WEBHOOK_PAYLOAD_BYTES } from '../src/lib/webhooks/events';

const SECRET = 'whsec_test_secret';

describe('webhook signatures', () => {
  it('signs timestamp.eventId.body and verifies round-trip', () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload('{"a":1}', SECRET, now, 'evt_123');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyWebhookSignature('{"a":1}', SECRET, now, 'evt_123', sig)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and replayed timestamps', () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload('{"a":1}', SECRET, now, 'evt_123');
    expect(verifyWebhookSignature('{"a":2}', SECRET, now, 'evt_123', sig)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', 'whsec_other', now, 'evt_123', sig)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', SECRET, now, 'evt_999', sig)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', SECRET, now - 3600, 'evt_123', sig)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', SECRET, now + 3600, 'evt_123', sig)).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', SECRET, now, 'evt_123', 'ff'.repeat(64))).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', SECRET, NaN, 'evt_123', sig)).toBe(false);
  });

  it('enforces the configured tolerance window (5 minutes)', () => {
    const within = 4 * 60;
    const outside = 6 * 60;
    const now = Math.floor(Date.now() / 1000);
    const sig = signWebhookPayload('x', SECRET, now, 'evt_1');
    expect(verifyWebhookSignature('x', SECRET, now, 'evt_1', sig, 300)).toBe(true);
    expect(verifyWebhookSignature('x', SECRET, now, 'evt_1', sig, within)).toBe(true);
    expect(verifyWebhookSignature('x', SECRET, now, 'evt_1', sig, outside - 1)).toBe(true);
    const old = Math.floor(Date.now() / 1000) - 400;
    const oldSig = signWebhookPayload('x', SECRET, old, 'evt_1');
    expect(verifyWebhookSignature('x', SECRET, old, 'evt_1', oldSig, 300)).toBe(false);
  });
});

describe('webhook URL policy (SSRF)', () => {
  it('accepts standard public HTTPS endpoints', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com/nova')).toBe(true);
    expect(checkWebhookUrl('https://hooks.example.com:8443/nova').ok).toBe(true);
    expect(checkWebhookUrl('https://203.0.113.9/hook').ok).toBe(true);
  });

  it('rejects non-HTTPS, bad ports, userinfo and control characters', () => {
    expect(checkWebhookUrl('http://hooks.example.com/nova').ok).toBe(false);
    expect(checkWebhookUrl('https://hooks.example.com:8080/nova').ok).toBe(false);
    expect(checkWebhookUrl('https://user:pass@hooks.example.com/nova').ok).toBe(false);
    expect(checkWebhookUrl('https://hooks.example.com/nova\r\nX-Evil: 1').ok).toBe(false);
    expect(checkWebhookUrl('not a url').ok).toBe(false);
  });

  it('rejects internal hostnames and every private/reserved IPv4 range', () => {
    expect(checkWebhookUrl('https://localhost/hook').ok).toBe(false);
    expect(checkWebhookUrl('https://sub.localhost/hook').ok).toBe(false);
    expect(checkWebhookUrl('https://service.internal/hook').ok).toBe(false);
    expect(checkWebhookUrl('https://printer.local/hook').ok).toBe(false);
    for (const host of ['127.0.0.1', '10.0.0.5', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.169.254', '0.0.0.1', '100.64.0.1', '224.0.0.1', '240.0.0.1']) {
      expect(isPrivateAddress(host)).toBe(true);
      expect(checkWebhookUrl(`https://${host}/hook`).ok).toBe(false);
    }
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });

  it('rejects loopback, link-local and unique-local IPv6', () => {
    for (const host of ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1']) {
      expect(isPrivateAddress(host)).toBe(true);
      expect(checkWebhookUrl(`https://[${host}]/hook`).ok).toBe(false);
    }
    // IPv4-mapped loopback must also be caught.
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });

  it('blocks DNS resolution pointing at private addresses (SSRF / DNS rebinding guard)', async () => {
    const evilResolve = async () => [{ address: '169.254.169.254', family: 4 }];
    await expect(resolveAndValidateHost('rebind.attacker.example', evilResolve)).rejects.toThrow('DNS_RESOLVED_PRIVATE_ADDRESS');
    const emptyResolve = async () => [];
    await expect(resolveAndValidateHost('dead.example', emptyResolve)).rejects.toThrow('DNS_RESOLUTION_EMPTY');
    const goodResolve = async () => [{ address: '93.184.216.34', family: 4 }];
    await expect(resolveAndValidateHost('hooks.example.com', goodResolve)).resolves.toEqual([{ address: '93.184.216.34', family: 4 }]);
    // The default resolver is a real DNS path — only assert it is a function.
    expect(typeof defaultResolve).toBe('function');
  });
});

describe('webhook events', () => {
  it('exposes a fixed event catalog and version', () => {
    expect(webhookEventTypes).toContain('order.paid');
    expect(webhookEventTypes).not.toContain('payment.approved');
    expect(WEBHOOK_EVENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MAX_WEBHOOK_PAYLOAD_BYTES).toBe(256 * 1024);
  });
});
