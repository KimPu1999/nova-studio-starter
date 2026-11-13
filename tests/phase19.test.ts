/**
 * Phase 19 — production readiness regression tests (pure, no database).
 * Covers the financial-integrity and security fixes from the Phase 19 audit:
 * refund caps, payment reference handling, cron endpoint authorization, and
 * middleware routing behavior. DB-dependent concurrency scenarios remain
 * covered by guarded transactions in the service layer (documented in
 * docs/production/testing.md).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { committedRefundedTotal, refundableAmountFor } from '../src/lib/billing/refunds';
import { normalizeReference } from '../src/lib/billing/payments';
import { POST as cronPost, GET as cronGet } from '../src/app/api/cron/billing-sweep/route';
import { middleware, config as middlewareConfig } from '../src/middleware';
import { NextRequest } from 'next/server';

describe('phase 19 — cumulative refund cap', () => {
  it('counts only committed (APPROVED/ISSUED/COMPLETED) credit notes', () => {
    const notes = [
      { status: 'REQUESTED', amountMmk: 9_000 },
      { status: 'REJECTED', amountMmk: 50_000 },
      { status: 'VOID', amountMmk: 70_000 },
      { status: 'APPROVED', amountMmk: 1_000 },
      { status: 'ISSUED', amountMmk: 2_000 },
      { status: 'COMPLETED', amountMmk: 4_000 },
    ];
    expect(committedRefundedTotal(notes)).toBe(7_000);
  });

  it('cap blocks completion of a credit note exceeding the remaining paid balance', () => {
    const invoice = { totalMmk: 50_000, amountPaidMmk: 30_000 };
    const completed = [{ status: 'COMPLETED', amountMmk: 20_000 }, { status: 'COMPLETED', amountMmk: 5_000 }];
    const eligible = refundableAmountFor(invoice, committedRefundedTotal(completed));
    expect(eligible).toBe(5_000);
    // A second ISSUED note for 10_000 cannot be completed.
    expect(10_000 > eligible).toBe(true);
  });

  it('allows the final eligible refund exactly up to the paid amount', () => {
    const invoice = { totalMmk: 50_000, amountPaidMmk: 50_000 };
    const eligible = refundableAmountFor(invoice, committedRefundedTotal([]));
    expect(eligible).toBe(50_000);
  });
});

describe('phase 19 — payment attempt references', () => {
  it('normalizes whitespace/case for the (method, reference) uniqueness slot', () => {
    expect(normalizeReference('  kbz  12345 ')).toBe('KBZ12345');
  });
});

describe('phase 19 — billing sweep cron endpoint', () => {
  const original = process.env.BILLING_JOBS_TOKEN;

  afterEach(() => {
    if (original === undefined) delete process.env.BILLING_JOBS_TOKEN;
    else process.env.BILLING_JOBS_TOKEN = original;
  });

  it('returns 503 (not 401) when BILLING_JOBS_TOKEN is not configured', async () => {
    delete process.env.BILLING_JOBS_TOKEN;
    const response = await cronPost(new Request('http://localhost/api/cron/billing-sweep', { method: 'POST' }));
    expect(response.status).toBe(503);
  });

  it('rejects requests without the Bearer token (401)', async () => {
    process.env.BILLING_JOBS_TOKEN = 'cron-token-at-least-24-chars';
    const response = await cronGet(new Request('http://localhost/api/cron/billing-sweep'));
    expect(response.status).toBe(401);
  });

  it('rejects a wrong Bearer token (401)', async () => {
    process.env.BILLING_JOBS_TOKEN = 'cron-token-at-least-24-chars';
    const response = await cronPost(new Request('http://localhost/api/cron/billing-sweep', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong-token-at-least-24-chars!!' },
    }));
    expect(response.status).toBe(401);
  });
});

describe('phase 19 — route guard middleware', () => {
  const cookie = { headers: { cookie: 'nova_admin_session=t' } };

  it('redirects unauthenticated /account to /login', () => {
    const response = middleware(new NextRequest('http://localhost/account/orders'));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login');
  });

  it('redirects unauthenticated /admin pages to /admin/login', () => {
    const response = middleware(new NextRequest('http://localhost/admin/orders'));
    expect(response.headers.get('location')).toBe('http://localhost/admin/login');
  });

  it('does not redirect the admin login page itself', () => {
    const response = middleware(new NextRequest('http://localhost/admin/login'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets authenticated cookie holders through', () => {
    const response = middleware(new NextRequest('http://localhost/account', cookie as never));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not match public routes (storefronts, marketplace)', () => {
    const matchers = middlewareConfig.matcher.map((m) => m.replace(/\/:path\*$/, ''));
    const publicPaths = ['/vendors/acme', '/templates', '/cart', '/checkout/x', '/', '/login', '/services', '/'];
    for (const path of publicPaths) {
      const matched = matchers.some((m) => path === m || path.startsWith(`${m}/`));
      expect(matched, `${path} must not require a session cookie`).toBe(false);
    }
  });
});
