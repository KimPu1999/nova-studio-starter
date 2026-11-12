import crypto from 'node:crypto';

export function signWebhookPayload(rawBody: string, secret: string, timestamp: number, eventId: string) {
  const signed = `${timestamp}.${eventId}.${rawBody}`;
  return crypto.createHmac('sha256', secret).update(signed).digest('hex');
}

export function verifyWebhookSignature(rawBody: string, secret: string, timestamp: number, eventId: string, signature: string, toleranceSeconds = 300) {
  if (!Number.isInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = signWebhookPayload(rawBody, secret, timestamp, eventId);
  const provided = Buffer.from(signature, 'hex');
  const actual = Buffer.from(expected, 'hex');
  return provided.length === actual.length && crypto.timingSafeEqual(provided, actual);
}

export function isSafeWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === 'metadata.google.internal' || host.endsWith('.local') || host === '127.0.0.1' || host === '::1' || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) return false;
    return !url.username && !url.password;
  } catch { return false; }
}
