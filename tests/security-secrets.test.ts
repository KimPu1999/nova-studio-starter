import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, generateCredential, hashCredential } from '../src/lib/security/secrets';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-only-session-secret-with-more-than-32-chars';

describe('security credential primitives', () => {
  it('encrypts and decrypts secrets without storing plaintext', () => {
    const encrypted = encryptSecret('totp-secret-value');
    expect(encrypted).not.toContain('totp-secret-value');
    expect(decryptSecret(encrypted)).toBe('totp-secret-value');
  });

  it('hashes credentials and generates unpredictable-looking prefixed values', () => {
    const credential = generateCredential('nva');
    expect(credential.startsWith('nva_')).toBe(true);
    expect(hashCredential(credential)).not.toBe(credential);
  });
});
