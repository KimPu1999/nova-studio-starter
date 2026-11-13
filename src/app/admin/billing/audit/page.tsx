import {prisma} from '@/lib/prisma';
import {requireBillingViewer} from '@/lib/billing/rbac';
import {getBillingLang, formatDateTime, formatNumber} from '@/lib/billing/i18n';
import {Pagination} from '@/app/billing/_components';
export const dynamic='force-dynamic';
const PAGE_SIZE=10;
export default async function AdminBillingAudit({searchParams}:{searchParams:Promise<{page?:string}>}){
  const {page:pageRaw}=await searchParams;
  await requireBillingViewer();
  const lang=await getBillingLang();
  const page=Math.max(1,Number(pageRaw)||1);
  const [rows,count]=await Promise.all([
    prisma.billingAuditLog.findMany({orderBy:{createdAt:'desc'},skip:(page-1)*PAGE_SIZE,take:PAGE_SIZE+1,include:{actor:{select:{name:true,email:true}}}}),
    prisma.billingAuditLog.count(),
  ]);
  const hasMore=rows.length>PAGE_SIZE;
  const visible=rows.slice(0,PAGE_SIZE);
  return <main className="admin-content">
    <p className="eyebrow">AUDIT HISTORY</p>
    <h1 className="admin-title">Billing audit log</h1>
    <div className="admin-panel mt-8 overflow-x-auto">
      {visible.length?<table className="admin-table"><thead><tr><th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        {visible.map(e=><tr key={e.id}>
          <td>{formatDateTime(e.createdAt)}</td>
          <td>{e.actor?.name||e.actor?.email||'system'}</td>
          <td className="text-xs">{e.entityType}<small className="block text-slate-500">{e.entityId?.slice(0,8)}</small></td>
          <td>{e.action.replaceAll('_',' ').toLowerCase()}</td>
          <td className="max-w-md truncate font-mono text-[11px] text-slate-400">{e.after?JSON.stringify(e.after):e.before?JSON.stringify(e.before):'—'}</td>
        </tr>)}
      </tbody></table>:<div className="admin-empty">{formatNumber(count)} entries.</div>}
    </div>
    <Pagination page={page} hasMore={hasMore} basePath="/admin/billing/audit?" lang={lang}/>
  </main>;
}
