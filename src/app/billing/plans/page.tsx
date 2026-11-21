import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/auth';
import { listActivePlans } from '@/lib/billing/plans';
import { getBillingLang, formatNumber } from '@/lib/billing/i18n';
import { subscribeAction } from '../actions';

export const dynamic = 'force-dynamic';

const FEATURE_LABELS: Record<string, string> = { aiBuilder: 'AI website builder', hosting: 'Website hosting', customDomain: 'Custom domains', apiAccess: 'Developer API access', prioritySupport: 'Priority support', auditLog: 'Audit log', whiteLabel: 'White label', sso: 'SSO / SAML' };
const LIMITS = [['includedSeats', 'Included seats'], ['websitesLimit', 'Websites'], ['customDomainsLimit', 'Custom domains'], ['storageMb', 'Storage'], ['bandwidthMb', 'Bandwidth'], ['monthlyAiCredits', 'AI credits / month'], ['monthlyApiRequests', 'API requests / month']] as const;

function displayLimit(key: (typeof LIMITS)[number][0], version: any, lang: 'en' | 'mm') {
  const value = version[key];
  if (value === null || value === undefined) return 'Unlimited';
  if (key === 'storageMb' || key === 'bandwidthMb') return `${formatNumber(value, lang)} MB`;
  return formatNumber(value, lang);
}

export default async function BillingPlans({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const { cycle } = await searchParams;
  const user = await requireUser();
  const lang = await getBillingLang();
  const activeCycle = cycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
  const [plans, manageableMemberships, personalAccount] = await Promise.all([
    listActivePlans(),
    prisma.workspaceMember.findMany({ where: { userId: user.id, role: { in: ['OWNER', 'ADMIN'] } }, include: { workspace: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } }),
    prisma.billingAccount.findFirst({ where: { ownerUserId: user.id, type: 'PERSONAL', isActive: true }, select: { id: true } }),
  ]);
  const workspaces = manageableMemberships.map((m) => m.workspace);
  const currentPlanIds = personalAccount ? new Set((await prisma.billingSubscription.findMany({ where: { accountId: personalAccount.id, status: 'ACTIVE' }, select: { planId: true } })).map((s) => s.planId)) : new Set<string>();
  const comparisonFeatures = [...new Set(plans.flatMap((p) => p.versions[0]?.features ?? []))];

  return <main className="billing-plans-page">
    <section className="billing-plans-hero"><div className="billing-plans-hero-grid" /><div className="billing-plans-hero-inner"><span className="hero-kicker"><Sparkles size={14} /> NOVA SUBSCRIPTIONS</span><h1>Choose a plan that gives your work <em>room to grow.</em></h1><p>Flexible workspace capabilities for building, hosting, and shipping digital products. Prices and limits below come directly from the active plan catalog.</p><div className="billing-trust-row"><span><ShieldCheck size={16} /> Verified payment activation</span><span><LockKeyhole size={16} /> Secure billing records</span></div></div></section>

    <section className="billing-plans-content"><div className="billing-cycle-row"><div><span className="eyebrow">PLANS & PRICING</span><h2 className="section-title">Simple, transparent billing.</h2></div><div className="cycle-selector"><Link href="/billing/plans" className={activeCycle === 'MONTHLY' ? 'active' : ''}>Monthly</Link><Link href="/billing/plans?cycle=ANNUAL" className={activeCycle === 'ANNUAL' ? 'active' : ''}>Annual</Link></div></div><p className="billing-plan-note">Subscriptions use NOVA's manual payment verification flow. Your plan and entitlements turn on only after the payment is verified by finance.</p>
      <div className="plan-grid nova-plan-grid">{plans.map((p) => { const v = p.versions[0]; if (!v) return null; const price = activeCycle === 'ANNUAL' ? v.annualPriceMmk : v.monthlyPriceMmk; const monthlyEquivalent = v.annualPriceMmk > 0 ? Math.round(v.annualPriceMmk / 12) : 0; const savings = v.monthlyPriceMmk > 0 && v.annualPriceMmk > 0 ? Math.max(0, Math.round((1 - v.annualPriceMmk / (v.monthlyPriceMmk * 12)) * 100)) : 0; const isCurrent = currentPlanIds.has(p.id); return <article key={p.id} className={`plan-card nova-plan-card ${p.tier === 'PRO' ? 'plan-card-featured' : ''}`}><div className="nova-plan-card-top"><div><span className="status-badge status-draft">{p.tier}</span><h3 className="plan-name">{p.name}</h3><p>{p.description || 'A focused set of tools for your next stage.'}</p></div>{p.tier === 'PRO' ? <span className="nova-plan-featured">Recommended</span> : null}</div><div className="nova-price-block"><strong>{price === 0 ? 'Free' : `${formatNumber(price, lang)} MMK`}</strong><span>{activeCycle === 'ANNUAL' ? '/ year' : '/ month'}</span>{activeCycle === 'ANNUAL' && monthlyEquivalent > 0 ? <small>{formatNumber(monthlyEquivalent, lang)} MMK / month equivalent · {savings}% based on current catalog prices</small> : null}</div><ul className="plan-features">{LIMITS.map(([key, label]) => <li key={key}><Check size={14} /> <span>{label}: <b>{displayLimit(key, v, lang)}</b></span></li>)}{Object.entries(FEATURE_LABELS).map(([key, label]) => <li key={key} className={v.features.includes(key) ? '' : 'no'}><Check size={14} /> <span>{label}</span></li>)}</ul>{isCurrent ? <p className="nova-current-plan">Current plan</p> : <form action={subscribeAction}><input type="hidden" name="planId" value={p.id} /><input type="hidden" name="cycle" value={activeCycle} /><fieldset className="nova-scope-field"><legend>Billing scope</legend><label><input type="radio" name="scope" value="PERSONAL" defaultChecked /> Personal</label>{workspaces.length ? <label><input type="radio" name="scope" value="WORKSPACE" /> Workspace</label> : null}</fieldset>{workspaces.length ? <select name="workspaceId" className="form-input nova-plan-select"><option value="">Select workspace</option>{workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select> : null}<button className="btn-primary w-full" type="submit">Choose {p.name} <ArrowRight size={16} /></button></form>}</article>; })}</div>
    </section>

    <section className="billing-comparison-wrap"><div className="billing-plans-content"><div className="section-heading"><div><span className="eyebrow">COMPARE</span><h2 className="section-title">See what is included.</h2></div><span className="billing-table-caption">Active plan limits · {activeCycle.toLowerCase()} catalog</span></div><div className="billing-comparison-table-wrap"><table className="billing-comparison-table"><thead><tr><th>Capability</th>{plans.map((p) => <th key={p.id}>{p.name}</th>)}</tr></thead><tbody>{LIMITS.map(([key, label]) => <tr key={key}><td>{label}</td>{plans.map((p) => <td key={p.id}>{p.versions[0] ? displayLimit(key, p.versions[0], lang) : '—'}</td>)}</tr>)}{comparisonFeatures.map((feature) => <tr key={feature}><td>{FEATURE_LABELS[feature] || feature}</td>{plans.map((p) => <td key={p.id}>{p.versions[0]?.features.includes(feature) ? <Check size={16} className="table-check" /> : <span className="table-dash">—</span>}</td>)}</tr>)}</tbody></table></div></div></section>

    <section className="billing-plans-content billing-how-section"><div className="section-heading"><div><span className="eyebrow">HOW IT WORKS</span><h2 className="section-title">A clear path to activation.</h2></div></div><div className="nova-billing-steps"><div><span>01</span><strong>Select a plan</strong><p>Choose the billing interval and scope that match your work.</p></div><div><span>02</span><strong>Submit payment</strong><p>Pay through a supported local method, then send the transaction reference and receipt.</p></div><div><span>03</span><strong>Get verified access</strong><p>Finance verifies the transfer before billing status and entitlements are updated.</p></div></div><div className="billing-faq"><h2>Questions, answered.</h2><details open><summary>Does choosing a plan charge me immediately?</summary><p>No. Paid subscriptions first create an invoice. Access begins only after the transfer is verified by NOVA finance.</p></details><details><summary>Can I change plans later?</summary><p>Yes. Plan changes create a new invoice and only apply after the required payment is verified. Existing one-time purchases remain independent.</p></details><details><summary>What happens if I cancel?</summary><p>End-of-period cancellation preserves valid access through the paid period. Your billing history and one-time product licenses are not deleted.</p></details></div><p className="billing-terms">By continuing, you agree to the subscription terms and manual payment verification policy. <Link href="/billing/invoices">View billing history <ArrowRight size={14} /></Link></p></section>
  </main>;
}
