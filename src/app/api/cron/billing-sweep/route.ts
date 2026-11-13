/**
 * Phase 19 — authorized entry point for external schedulers (cron, GitHub
 * Actions scheduled workflows, Vercel Cron). The billing sweep is idempotent;
 * concurrent invocations cannot create duplicate invoices or mark unpaid
 * renewals as paid. Guarded by BILLING_JOBS_TOKEN (>= 24 chars) as a Bearer
 * token; the endpoint returns 503 (not 401) when the token is not configured
 * so schedulers fail loudly instead of silently succeeding without a sweep.
 */
import { NextResponse } from 'next/server';
import { runBillingSweep } from '@/lib/billing/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request) {
  const token = process.env.BILLING_JOBS_TOKEN;
  if (!token || token.length < 24) {
    return NextResponse.json({ error: 'Billing jobs endpoint is not configured.' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  try {
    const result = await runBillingSweep();
    return NextResponse.json({ ok: true, result }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Billing sweep failed.' }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
