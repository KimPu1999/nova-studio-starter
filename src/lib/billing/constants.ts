/**
 * Phase 18 — shared billing constants.
 *
 * Money convention: every monetary amount in the billing domain is an integer
 * number of MMK kyat (no floats, no decimals). All timestamps are stored in UTC;
 * Asia/Yangon (+06:30) is a display-only concern.
 */
import type {
  BillingSubscriptionStatus,
  BillingInvoiceStatus,
  BillingUsageMeterCode,
  BillingScopeType,
} from '@prisma/client';

/** Valid subscription lifecycle transitions (from -> allowed targets). */
export const SUBSCRIPTION_TRANSITIONS: Record<BillingSubscriptionStatus, BillingSubscriptionStatus[]> = {
  INCOMPLETE: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  ACTIVE: ['PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
  PAST_DUE: ['GRACE_PERIOD', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
  GRACE_PERIOD: ['ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'],
  SUSPENDED: ['ACTIVE', 'CANCELLED', 'EXPIRED'],
  CANCELLED: [],
  EXPIRED: [],
};

/** Statuses that occupy the unique "active slot" for a billing scope. */
export const SLOT_HOLDING_STATUSES: BillingSubscriptionStatus[] = [
  'INCOMPLETE',
  'PENDING_PAYMENT',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'SUSPENDED',
];

/** Invoice statuses that can still receive verified payments. */
export const PAYABLE_INVOICE_STATUSES: BillingInvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

export const TERMINAL_SUBSCRIPTION_STATUSES: BillingSubscriptionStatus[] = ['CANCELLED', 'EXPIRED'];

/** Entitlement feature keys derived from plan versions. */
export const FEATURE_KEYS = {
  SEATS_INCLUDED: 'seats.included',
  SEATS_MAX: 'seats.max',
  WEBSITES_MAX: 'websites.max',
  DOMAINS_MAX: 'domains.max',
  STORAGE_MB: 'storage.mb',
  BANDWIDTH_MB: 'bandwidth.mb',
  AI_CREDITS_MONTHLY: 'ai.credits.monthly',
  API_REQUESTS_MONTHLY: 'api.requests.monthly',
} as const;

/** Feature flags carried on plan versions (valueBool entitlements). */
export const KNOWN_FEATURE_FLAGS = ['hosting', 'apiAccess', 'aiBuilder', 'prioritySupport', 'customDomain', 'sso', 'auditLog', 'whiteLabel'] as const;

/** Grace period before suspension, in days (customer data is preserved). */
export const GRACE_PERIOD_DAYS = 7;

/** Renewable (non-free) subscription statuses considered due for renewal invoices. */
export const RENEWABLE_STATUSES: BillingSubscriptionStatus[] = ['ACTIVE', 'PAST_DUE', 'GRACE_PERIOD'];

export const BILLING_METER_CODES: BillingUsageMeterCode[] = [
  'AI_TOKENS',
  'AI_CREDITS',
  'API_REQUESTS',
  'HOSTING_STORAGE_MB',
  'HOSTING_BANDWIDTH_MB',
  'DEPLOYMENTS',
];

export function billingScopeKey(scopeType: BillingScopeType, subjectId: string): string {
  switch (scopeType) {
    case 'PERSONAL':
      return `USER:${subjectId}`;
    case 'WORKSPACE':
      return `WS:${subjectId}`;
    case 'WEBSITE':
      return `SITE:${subjectId}`;
  }
}

/** UTC month period containing a date: [start, end). */
export function utcMonthPeriod(date: Date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd };
}

/** Adds one UTC billing period to a date. */
export function advancePeriod(start: Date, cycle: 'MONTHLY' | 'ANNUAL'): Date {
  const d = new Date(start);
  if (cycle === 'ANNUAL') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Normalizes a subscription to monthly revenue (MMK) for MRR/ARR math. */
export function monthlyNormalizedMmk(priceMmk: number, cycle: 'MONTHLY' | 'ANNUAL'): number {
  return cycle === 'ANNUAL' ? Math.round(priceMmk / 12) : priceMmk;
}

export function assertIntMmk(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer MMK amount.`);
  return value;
}
