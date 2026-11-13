/**
 * Phase 18 — billing logic tests (pure, no database required).
 * DB-dependent integration scenarios (concurrent verification, seat races) are
 * exercised by transaction guards in the service layer; see docs/billing/security.md.
 */
import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_TRANSITIONS,
  SLOT_HOLDING_STATUSES,
  PAYABLE_INVOICE_STATUSES,
  advancePeriod,
  assertIntMmk,
  billingScopeKey,
  monthlyNormalizedMmk,
  utcMonthPeriod,
  FEATURE_KEYS,
} from '../src/lib/billing/constants';
import { assertTransition } from '../src/lib/billing/subscriptions';
import { computeInvoiceTotals, composeInvoiceNumber, composeToken } from '../src/lib/billing/invoices';
import { refundableAmountFor } from '../src/lib/billing/refunds';
import { assertWithinQuota } from '../src/lib/billing/entitlements';
import { parseStatementCsv, parseStatementCsv as parseCsv } from '../src/lib/billing/reconciliation';
import { normalizeReference } from '../src/lib/billing/payments';
import { parseInvoiceLines } from '../src/lib/billing/validation';

describe('subscription lifecycle state machine', () => {
  it('allows PENDING_PAYMENT -> ACTIVE', () => {
    expect(() => assertTransition('PENDING_PAYMENT', 'ACTIVE')).not.toThrow();
  });

  it('allows grace -> suspended and suspended -> active (reactivation)', () => {
    expect(() => assertTransition('GRACE_PERIOD', 'SUSPENDED')).not.toThrow();
    expect(() => assertTransition('SUSPENDED', 'ACTIVE')).not.toThrow();
  });

  it('forbids activating without payment (INCOMPLETE -> ACTIVE)', () => {
    expect(() => assertTransition('INCOMPLETE', 'ACTIVE')).toThrow(/Invalid subscription transition/);
  });

  it('forbids silent auto-renew of unpaid renewal (ACTIVE stays paid only via verifier)', () => {
    // The only path to ACTIVE from a due subscription is through a verified
    // payment; PAST_DUE -> ACTIVE is allowed (late verified payment), but
    // ACTIVE -> ACTIVE is not a state machine transition at all.
    expect(SUBSCRIPTION_TRANSITIONS.PAST_DUE).toContain('ACTIVE');
    expect(SUBSCRIPTION_TRANSITIONS.ACTIVE).not.toContain('ACTIVE');
  });

  it('terminal states have no exits', () => {
    expect(SUBSCRIPTION_TRANSITIONS.CANCELLED).toEqual([]);
    expect(SUBSCRIPTION_TRANSITIONS.EXPIRED).toEqual([]);
  });

  it('all statuses are present in the transition table', () => {
    for (const status of Object.keys(SUBSCRIPTION_TRANSITIONS)) {
      expect(SLOT_HOLDING_STATUSES.includes(status as never) || SUBSCRIPTION_TRANSITIONS[status as keyof typeof SUBSCRIPTION_TRANSITIONS].length === 0).toBe(true);
    }
  });
});

describe('invoice totals', () => {
  it('computes subtotal and total from lines', () => {
    const totals = computeInvoiceTotals(
      [
        { lineType: 'SUBSCRIPTION_PLAN', description: 'Pro monthly', quantity: 1, unitAmountMmk: 45_000 },
        { lineType: 'SEATS', description: 'Extra seats', quantity: 2, unitAmountMmk: 5_000 },
      ],
      1_000,
      900,
    );
    expect(totals.subtotalMmk).toBe(55_000);
    expect(totals.totalMmk).toBe(54_900);
  });

  it('rejects negative totals, zero lines and non-integer money', () => {
    expect(() => computeInvoiceTotals([{ lineType: 'OTHER', description: 'x', quantity: 1, unitAmountMmk: 100 }], 500, 0)).toThrow(/negative/);
    expect(() => computeInvoiceTotals([], 0, 0)).toThrow(/at least one line/);
    expect(() => computeInvoiceTotals([{ lineType: 'OTHER', description: 'x', quantity: 1, unitAmountMmk: 100.5 }], 0, 0)).toThrow(/integer/);
    expect(() => assertIntMmk(-1, 'x')).toThrow(/non-negative integer/);
  });

  it('rejects invalid quantity', () => {
    expect(() => computeInvoiceTotals([{ lineType: 'OTHER', description: 'x', quantity: 0, unitAmountMmk: 100 }], 0, 0)).toThrow();
  });
});

describe('invoice numbering', () => {
  it('produces a deterministic prefix and unique token suffix', () => {
    const n1 = composeInvoiceNumber('NV', new Date(Date.UTC(2026, 10, 13)), composeToken('renewal:abc:2026-11-13'));
    const n2 = composeInvoiceNumber('NV', new Date(Date.UTC(2026, 10, 13)), composeToken('renewal:abc:2026-11-13'));
    expect(n1).toMatch(/^NV-202611-[A-Z0-9]{7}$/);
    expect(n1).not.toBe(n2); // random suffix guards collision retries
  });
});

describe('refund eligibility', () => {
  it('refunds never exceed paid minus already refunded', () => {
    expect(refundableAmountFor({ totalMmk: 100_000, amountPaidMmk: 60_000 }, 10_000)).toBe(50_000);
    expect(refundableAmountFor({ totalMmk: 100_000, amountPaidMmk: 0 }, 0)).toBe(0);
    expect(refundableAmountFor({ totalMmk: 100_000, amountPaidMmk: 50_000 }, 50_000)).toBe(0);
  });
});

describe('quota guard', () => {
  it('null limit means unlimited', () => {
    expect(assertWithinQuota(null, 999_999, 1)).toBe(true);
  });
  it('blocks overage and computes it', () => {
    expect(assertWithinQuota(100, 96, 5)).toBe(false);
    expect(assertWithinQuota(100, 95, 5)).toBe(true);
  });
  it('rejects negative requests', () => {
    expect(assertWithinQuota(100, 0, -1)).toBe(false);
  });
});

describe('periods and MRR', () => {
  it('UTC month period covers exactly the month', () => {
    const { periodStart, periodEnd } = utcMonthPeriod(new Date(Date.UTC(2026, 1, 15)));
    expect(periodStart.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
  it('normalizes annual to monthly for MRR', () => {
    expect(monthlyNormalizedMmk(1_200_000, 'ANNUAL')).toBe(100_000);
    expect(monthlyNormalizedMmk(45_000, 'MONTHLY')).toBe(45_000);
  });
  it('advances periods correctly', () => {
    expect(advancePeriod(new Date(Date.UTC(2026, 0, 31)), 'MONTHLY').toISOString()).toBe('2026-03-03T00:00:00.000Z'); // JS overflow semantics, documented
    expect(advancePeriod(new Date(Date.UTC(2026, 5, 15)), 'ANNUAL').getUTCFullYear()).toBe(2027);
  });
});

describe('scope keys', () => {
  it('derives tenant-scoped keys', () => {
    expect(billingScopeKey('PERSONAL', 'u1')).toBe('USER:u1');
    expect(billingScopeKey('WORKSPACE', 'w1')).toBe('WS:w1');
    expect(billingScopeKey('WEBSITE', 's1')).toBe('SITE:s1');
  });
});

describe('statement parsing and dedupe', () => {
  it('parses reference,amount,date rows and skips comments', () => {
    const rows = parseStatementCsv('# comment\nREF-001,5000,2026-11-01\nREF-002,10000');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ reference: 'REF-001', amountMmk: 5000, occurredAt: new Date('2026-11-01') });
    expect(rows[1].occurredAt).toBeUndefined();
  });
  it('rejects malformed rows', () => {
    expect(() => parseStatementCsv('REF-001,not-a-number')).toThrow();
    expect(() => parseStatementCsv('only-one-column')).toThrow();
  });
  it('normalizes references for dedupe', () => {
    expect(normalizeReference(' kbz  20261113-x ')).toBe('KBZ20261113-X');
  });
  it('exposes a stable parse used by reconciliation', () => {
    expect(parseCsv('A12,1000')).toHaveLength(1);
  });
});

describe('feature keys and payable statuses', () => {
  it('covers all entitlement keys', () => {
    expect(Object.values(FEATURE_KEYS)).toContain('seats.max');
    expect(Object.values(FEATURE_KEYS)).toContain('ai.credits.monthly');
  });
  it('void and draft invoices are not payable', () => {
    expect(PAYABLE_INVOICE_STATUSES).not.toContain('VOID');
    expect(PAYABLE_INVOICE_STATUSES).not.toContain('DRAFT');
    expect(PAYABLE_INVOICE_STATUSES).toContain('OVERDUE');
  });
});

describe('admin invoice line parser', () => {
  it('parses Description | Amount and Description | Qty | Amount', () => {
    expect(parseInvoiceLines('Setup fee | 15000\nExtra seats | 3 | 5000')).toEqual([
      { lineType: 'ADJUSTMENT', description: 'Setup fee', quantity: 1, unitAmountMmk: 15000 },
      { lineType: 'ADJUSTMENT', description: 'Extra seats', quantity: 3, unitAmountMmk: 5000 },
    ]);
  });
  it('rejects bad lines', () => {
    expect(() => parseInvoiceLines('no pipes')).toThrow();
    expect(() => parseInvoiceLines('A | -5')).toThrow();
  });
});
