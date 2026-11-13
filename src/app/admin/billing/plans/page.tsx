import {prisma} from '@/lib/prisma';
import {requireBillingViewer, requireBillingPlatformAdmin} from '@/lib/billing/rbac';
import {getBillingLang, formatMmk, formatNumber, formatDateTime} from '@/lib/billing/i18n';
import {createPlanVersionAction} from '../actions';
export const dynamic='force-dynamic';
export default async function AdminBillingPlans(){
  const viewer=await requireBillingViewer();
  const canEdit=viewer.role.code==='SUPER_ADMIN'||viewer.role.code==='ADMIN';
  const lang=await getBillingLang();
  const plans=await prisma.billingPlan.findMany({orderBy:{sortOrder:'asc'},include:{versions:{orderBy:{version:'desc'},take:3}}});
  return <main className="admin-content">
    <p className="eyebrow">PLAN CATALOG</p>
    <h1 className="admin-title">Plans</h1>
    <p className="mt-2 text-sm text-slate-400">Prices are versioned: existing subscriptions and invoices keep their historical version; activating a new version never retro-modifies them.</p>
    <div className="admin-panel mt-8 overflow-x-auto">
      <table className="admin-table"><thead><tr><th>Plan</th><th>v</th><th>Status</th><th>Monthly</th><th>Annual</th><th>Seats</th><th>Websites</th><th>Domains</th><th>Storage</th><th>Bandwidth</th><th>AI credits</th><th>API req/mo</th><th>Features</th><th>Created</th></tr></thead><tbody>
        {plans.flatMap(p=>p.versions.map(v=><tr key={v.id}>
          <td>{p.name}{v.version===1&&p.versions.length>0&&v.status!=='ACTIVE'?'':''}</td>
          <td>{formatNumber(v.version,lang)}</td>
          <td><span className={`status-badge ${v.status==='ACTIVE'?'status-published':v.status==='DRAFT'?'status-draft':'status-archived'}`}>{v.status.toLowerCase()}</span></td>
          <td>{formatMmk(v.monthlyPriceMmk,lang)}</td>
          <td>{formatMmk(v.annualPriceMmk,lang)}</td>
          <td>{formatNumber(v.includedSeats,lang)}{v.maxSeats?`→${formatNumber(v.maxSeats,lang)}`:'→∞'}</td>
          <td>{v.websitesLimit===null?'∞':formatNumber(v.websitesLimit,lang)}</td>
          <td>{v.customDomainsLimit===null?'∞':formatNumber(v.customDomainsLimit,lang)}</td>
          <td>{v.storageMb===null?'∞':`${formatNumber(v.storageMb,lang)}MB`}</td>
          <td>{v.bandwidthMb===null?'∞':`${formatNumber(v.bandwidthMb,lang)}MB`}</td>
          <td>{formatNumber(v.monthlyAiCredits,lang)}</td>
          <td>{v.monthlyApiRequests===null?'∞':formatNumber(v.monthlyApiRequests,lang)}</td>
          <td className="text-xs text-slate-400">{v.features.join(', ')||'—'}</td>
          <td className="text-xs text-slate-400">{formatDateTime(v.createdAt,lang)}</td>
        </tr>))}
      </tbody></table>
    </div>
    {canEdit&&<div className="billing-drawer max-w-3xl">
      <h2 className="font-semibold">Create new plan version</h2>
      <form action={createPlanVersionAction} className="admin-form">
        <label>Plan
          <select name="planId" className="form-input" required>{plans.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Monthly price (MMK int)<input className="form-input" name="monthlyPriceMmk" type="number" min={0} required/></label>
          <label>Annual price (MMK int)<input className="form-input" name="annualPriceMmk" type="number" min={0} required/></label>
          <label>Included seats<input className="form-input" name="includedSeats" type="number" min={1} defaultValue={1} required/></label>
          <label>Max seats (empty = unlimited)<input className="form-input" name="maxSeats" type="number" min={1}/></label>
          <label>Websites limit (empty = unlimited)<input className="form-input" name="websitesLimit" type="number" min={0}/></label>
          <label>Custom domains limit<input className="form-input" name="customDomainsLimit" type="number" min={0}/></label>
          <label>Storage MB<input className="form-input" name="storageMb" type="number" min={0}/></label>
          <label>Bandwidth MB<input className="form-input" name="bandwidthMb" type="number" min={0}/></label>
          <label>Monthly AI credits<input className="form-input" name="monthlyAiCredits" type="number" min={0} defaultValue={0} required/></label>
          <label>Monthly API requests (empty = unlimited)<input className="form-input" name="monthlyApiRequests" type="number" min={0}/></label>
        </div>
        <label>Feature flags (comma separated: aiBuilder, hosting, customDomain, apiAccess, prioritySupport, auditLog, whiteLabel, sso)<input className="form-input" name="features" placeholder="aiBuilder,hosting,customDomain"/></label>
        <label>Version notes<input className="form-input" name="notes"/></label>
        <label className="flex items-center gap-2"><input type="checkbox" name="activate" value="true"/> Activate immediately (retires the current ACTIVE version)</label>
        <button className="btn-primary" type="submit">Create version</button>
      </form>
    </div>}
  </main>;
}
