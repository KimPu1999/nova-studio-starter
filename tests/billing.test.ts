/**
 * Phase 18 — billing invariants (unit tests).
 *
 * Covers pure financial logic: integer-MMK totals, immutable invoice math,
 * subscription state-machine validity, refund eligibility, payment reference
 * normalization, statement parsing, quota guards, and separation of duties.
 * Database-backed flows are additionally exercised through the migrations
 * (unique idempotency constraints) — see docs/billing/security.md.
 */
import { describe, expect, it } from 'vitest';
import {
  SUBSCRIPTION_TRANSITIONS,
  TERMINAL_SUBSCRIPTION_STATUSES,
  SLOT_HOLDING_STATUSES,
  PAYABLE_INVOICE_STATUSES,
  assertIntMmk,
  monthlyNormalizedMmk,
  advancePeriod,
  utcMonthPeriod,
  billingScopeKey,
} from '../src/lib/billing/constants';
import { computeInvoiceTotals, composeInvoiceNumber, composeToken } from '../src/lib/billing/invoices';
import { assertTransition } from '../src/lib/billing/subscriptions';
import { refundableAmountFor } from '../src/lib/billing/refunds';
import { normalizeReference } from '../src/lib/billing/payments';
import { parseStatementCsv } from '../src/lib/billing/reconciliation';
import { assertWithinQuota } from '../src/lib/billing/entitlements';
import { assertNotSelfApproval } from '../src/lib/billing/rbac';

describe('integer-MMK money convention', () => {
  it('accepts non-negative safe integers', () => {
    expect(assertIntMmk(0, 'x')).toBe(0);
    expect(assertIntMmk(15_000, 'x')).toBe(15_000);
  });

  it('rejects floats, negatives and unsafe values', () => {
    expect(() => assertIntMmk(-1, 'x')).toThrow();
    expect(() => assertIntMmk(1.5, 'x')).toThrow();
    expect(() => assertIntMmk(Number.NaN, 'x')).toThrow();
    expect(() => assertIntMmk(Number.MAX_SAFE_INTEGER + 1, 'x')).toThrow();
  });
});

describe('invoice totals', () => {
  const line = (unit: number, quantity = 1) => ({ lineType: 'SUBSCRIPTION_PLAN' as const, description: 'Plan', quantity, unitAmountMmk: unit });

  it('computes subtotal, discounts, tax and total from lines', () => {
    const totals = computeInvoiceTotals([line(15_000), line(1_200, 2)], 500, 300);
    expect(totals.subtotalMmk).toBe(17_400);
    expect(totals.totalMmk).toBe(17_200);
  });

  it('rejects invalid lines and negative totals', () => {
    expect(() => computeInvoiceTotals([], 0, 0)).toThrow();
    expect(() => computeInvoiceTotals([line(0, 0)], 0, 0)).toThrow(); // quantity must be >= 1
    expect(() => computeInvoiceTotals([line(1_000)], 2_000, 0)).toThrow(); // negative total
    expect(() => computeInvoiceTotals([{ lineType: 'OTHER' as never, description: '', quantity: 1, unitAmountMmk: 100 }], 0, 0)).toThrow();
  });

  it('keeps per-line amounts as integers', () => {
    const totals = computeInvoiceTotals([line(7_777, 3)], 0, 0);
    expect(totals.lines[0].amountMmk).toBe(23_331);
    expect(Number.isSafeInteger(totals.totalMmk)).toBe(true);
  });

  it('generates unique-format invoice numbers and stable tokens', () => {
    const number = composeInvoiceNumber('NV', new Date(Date.UTC(2026, 10, 5)), 'ABC123');
    expect(number).toMatch(/^NV-202611-[A-Z0-9]{6}$/);
    expect(composeToken('sub:USER:x').length).toBeGreaterThanOrEqual(6);
  });
});

describe('subscription lifecycle state machine', () => {
  const statuses = Object.keys(SUBSCRIPTION_TRANSITIONS) as Array<keyof typeof SUBSCRIPTION_TRANSITIONS>;

  it('targets are always valid statuses', () => {
    for (const from of statuses) {
      for (const to of SUBSCRIPTION_TRANSITIONS[from]) {
        expect(statuses).toContain(to);
      }
    }
  });

  it('terminal statuses have no outgoing transitions', () => {
    for (const terminal of TERMINAL_SUBSCRIPTION_STATUSES) {
      expect(SUBSCRIPTION_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it('never activates directly from INCOMPLETE (payment must be reviewed)', () => {
    expect(SUBSCRIPTION_TRANSITIONS.INCOMPLETE).not.toContain('ACTIVE');
    expect(SUBSCRIPTION_TRANSITIONS.INCOMPLETE).toContain('PENDING_PAYMENT');
  });

  it('enforces transitions at runtime', () => {
    expect(() => assertTransition('INCOMPLETE', 'ACTIVE')).toThrow();
    expect(() => assertTransition('CANCELLED', 'ACTIVE')).toThrow();
    expect(() => assertTransition('PENDING_PAYMENT', 'ACTIVE')).not.toThrow();
  });

  it('slot-holding statuses exclude terminal ones (prevents duplicate active subs)', () => {
    for (const status of SLOT_HOLDING_STATUSES) expect(TERMINAL_SUBSCRIPTION_STATUSES).not.toContain(status);
  });
});

describe('refunds', () => {
  it('refundable amount is paid minus already refunded, never negative', () => {
    expect(refundableAmountFor({ totalMmk: 15_000, amountPaidMmk: 15_000 }, 0)).toBe(15_000);
    expect(refundableAmountFor({ totalMmk: 15_000, amountPaidMmk: 15_000 }, 5_000)).toBe(10_000);
    expect(refundableAmountFor({ totalMmk: 15_000, amountPaidMmk: 15_000 }, 20_000)).toBe(0);
    expect(refundableAmountFor({ totalMmk: 15_000, amountPaidMmk: 0 }, 0)).toBe(0);
  });

  it('rejects corrupted refunded trackers', () => {
    expect(() => refundableAmountFor({ totalMmk: 1, amountPaidMmk: 1 }, -5)).toThrow();
  });
});

describe('payment reference normalization (duplicate prevention input)', () => {
  it('normalizes whitespace and case for deduplication', () => {
    expect(normalizeReference(' kbz 1234567 ')).toBe('KBZ1234567');
  });
});

describe('reconciliation statement parsing', () => {
  it('parses valid CSV rows with optional dates', () => {
    const rows = parseStatementCsv('# export\nKBZ1234567,150000,2026-11-02\nWV987654,45000');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ reference: 'KBZ1234567', amountMmk: 150_000, occurredAt: new Date('2026-11-02') });
    expect(rows[1].occurredAt).toBeUndefined();
  });

  it('rejects malformed rows instead of fabricating data', () => {
    expect(() => parseStatementCsv('badrow')).toThrow();
    expect(() => parseStatementCsv('REF,not-a-number')).toThrow();
    expect(() => parseStatementCsv('REF,-500')).toThrow();
  });
});

describe('usage quota guards', () => {
  it('null limits mean unlimited', () => {
    expect(assertWithinQuota(null, 1_000_000, 10)).toBe(true);
  });

  it('blocks consumption past the limit', () => {
    expect(assertWithinQuota(100, 95, 5)).toBe(true);
    expect(assertWithinQuota(100, 95, 6)).toBe(false);
  });

  it('rejects negative requests', () => {
    expect(assertWithinQuota(100, 0, -1)).toBe(false);
  });
});

describe('periods and MRR math', () => {
  it('monthly normalization of annual prices divides by 12', () => {
    expect(monthlyNormalizedMmk(150_000, 'ANNUAL')).toBe(12_500);
    expect(monthlyNormalizedMmk(45_000, 'MONTHLY')).toBe(45_000);
  });

  it('UTC month period is half-open [start, end)', () => {
    const { periodStart, periodEnd } = utcMonthPeriod(new Date(Date.UTC(2026, 10, 15)));
    expect(periodStart.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('advances periods across years', () => {
    expect(advancePeriod(new Date(Date.UTC(2026, 11, 1)), 'MONTHLY').toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(advancePeriod(new Date(Date.UTC(2026, 0, 1)), 'ANNUAL').toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('tenant scope keys', () => {
  it('scopes are namespaced per type', () => {
    expect(billingScopeKey('PERSONAL', 'u1')).toBe('USER:u1');
    expect(billingScopeKey('WORKSPACE', 'w1')).toBe('WS:w1');
    expect(billingScopeKey('WEBSITE', 's1')).toBe('SITE:s1');
  });
});

describe('separation of duties', () => {
  it('blocks self-approval of financial decisions', () => {
    expect(() => assertNotSelfApproval('u1', 'u1', 'this payment')).toThrow(/separation of duties/i);
    expect(() => assertNotSelfApproval('u1', 'u2', 'this payment')).not.toThrow();
  });
});

describe('payable invoice statuses', () => {
  it('void and paid invoices cannot receive payments', () => {
    expect(PAYABLE_INVOICE_STATUSES).toEqual(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']);
    expect(PAYABLE_INVOICE_STATUSES).not.toContain('PAID');
    expect(PAYABLE_INVOICE_STATUSES).not.toContain('VOID');
    expect(PAYABLE_INVOICE_STATUSES).not.toContain('DRAFT');
  });
});
