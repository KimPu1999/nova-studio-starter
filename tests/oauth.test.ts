import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { pkceChallenge, validPkceVerifier, redirectUriAllowed, clampScopes, parseScopeParam, OAuthErrors } from '../src/lib/api/oauth';
import { apiScopes } from '../src/lib/api-v1';

describe('PKCE (RFC 7636)', () => {
  it('computes the S256 challenge as base64url(sha256(verifier)) without padding', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    const random = crypto.randomBytes(48).toString('base64url');
    expect(pkceChallenge(random)).not.toContain('=');
    expect(pkceChallenge(verifier)).toBe(pkceChallenge(verifier));
  });

  it('validates verifier shape (43-128 unreserved chars)', () => {
    expect(validPkceVerifier('a'.repeat(43))).toBe(true);
    expect(validPkceVerifier('a'.repeat(128))).toBe(true);
    expect(validPkceVerifier('a'.repeat(42))).toBe(false);
    expect(validPkceVerifier('a'.repeat(129))).toBe(false);
    expect(validPkceVerifier('a'.repeat(43) + '&')).toBe(false);
  });
});

describe('redirect URI validation', () => {
  it('requires exact matching (no prefix, suffix or substring matches)', () => {
    const allowed = ['https://app.example.com/callback'];
    expect(redirectUriAllowed(allowed, 'https://app.example.com/callback')).toBe(true);
    expect(redirectUriAllowed(allowed, 'https://app.example.com/callback/extra')).toBe(false);
    expect(redirectUriAllowed(allowed, 'https://app.example.com/callback?next=x')).toBe(false);
    expect(redirectUriAllowed(allowed, 'https://evil.example.com/https://app.example.com/callback')).toBe(false);
    expect(redirectUriAllowed(allowed, 'http://app.example.com/callback')).toBe(false);
  });
});

describe('scope clamping', () => {
  it('intersects requested scopes with client registration and the public list', () => {
    const client = ['projects:read', 'projects:write'];
    expect(clampScopes(['projects:read', 'projects:write'], client)).toEqual(['projects:read', 'projects:write']);
    expect(clampScopes(['projects:read'], client)).toEqual(['projects:read']);
    // Not registered on the client → dropped.
    expect(clampScopes(['marketplace:read'], client)).toEqual([]);
  });

  it('drops unknown or client-forged scopes entirely', () => {
    const client = ['profile:read'];
    expect(clampScopes(['profile:read', 'made_up:scope', ''], client)).toEqual(['profile:read']);
    expect(clampScopes([], client)).toEqual([]);
    // Scopes can never exceed the fixed public scope list.
    for (const granted of clampScopes([...apiScopes], [...apiScopes])) {
      expect(apiScopes).toContain(granted);
    }
  });

  it('parses space-delimited scope parameters', () => {
    expect(parseScopeParam('profile:read projects:read')).toEqual(['profile:read', 'projects:read']);
    expect(parseScopeParam('  ')).toEqual([]);
    expect(parseScopeParam(null)).toEqual([]);
    expect(parseScopeParam('a\tb')).toEqual(['a', 'b']);
  });
});

describe('OAuth error bodies', () => {
  it('uses RFC 6749 error codes', () => {
    expect(OAuthErrors.invalidClient().error).toBe('invalid_client');
    expect(OAuthErrors.unsupportedGrantType().error).toBe('unsupported_grant_type');
    expect(OAuthErrors.invalidGrant('x').error).toBe('invalid_grant');
    expect(OAuthErrors.invalidScope('x').error).toBe('invalid_scope');
    expect(OAuthErrors.invalidRequest('x').error).toBe('invalid_request');
  });
});
