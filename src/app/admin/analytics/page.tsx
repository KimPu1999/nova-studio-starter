import Link from 'next/link';
import {RoleCode} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {prisma} from '@/lib/prisma';

export const dynamic='force-dynamic';

export default async function Analytics({searchParams}:{searchParams:Promise<{from?:string;to?:string}>}){
  await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]);
  const params=await searchParams;
  const from=params.from?new Date(`${params.from}T00:00:00`):new Date(new Date().getFullYear(),new Date().getMonth(),1);
  const to=params.to?new Date(`${params.to}T00:00:00`):new Date();
  const end=new Date(to); end.setDate(end.getDate()+1);
  const range={gte:from,lt:end};
  const [orders,courses,invoices,refunds,customers]=await Promise.all([
    prisma.order.findMany({where:{status:'PAID',createdAt:range},select:{id:true,userId:true,totalMmk:true,createdAt:true}}),
    prisma.coursePurchase.findMany({where:{status:'PAID',createdAt:range},select:{id:true,buyerId:true,unitPriceMmk:true,createdAt:true}}),
    prisma.projectInvoice.findMany({where:{status:{in:['PARTIALLY_PAID','PAID']},createdAt:range},select:{id:true,clientId:true,amountPaidMmk:true,createdAt:true}}),
    prisma.refundRequest.findMany({where:{status:'COMPLETED',createdAt:range},select:{approvedAmountMmk:true}}),
    prisma.user.count({where:{role:{code:RoleCode.CUSTOMER},createdAt:range}})
  ]);
  const marketplace=orders.reduce((n,row)=>n+row.totalMmk,0); const coursesRevenue=courses.reduce((n,row)=>n+row.unitPriceMmk,0); const projects=invoices.reduce((n,row)=>n+row.amountPaidMmk,0); const gross=marketplace+coursesRevenue+projects; const refundTotal=refunds.reduce((n,row)=>n+(row.approvedAmountMmk||0),0); const paidTransactions=orders.length+courses.length+invoices.length; const net=Math.max(0,gross-refundTotal);
  const uniqueCustomers=new Set([...orders.map(x=>x.userId),...courses.map(x=>x.buyerId),...invoices.map(x=>x.clientId)]).size;
  return <main className="admin-content"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">OPERATIONS</p><h1 className="admin-title">Business analytics</h1><p className="mt-2 text-sm text-slate-400">Verified MMK transactions only. Payment submissions are excluded.</p></div><div className="flex gap-2"><Link href="/admin/analytics/revenue" className="btn-outline">Revenue detail</Link><Link href="/admin/marketing/campaigns" className="btn-outline">Marketing</Link></div></div><form className="mt-6 flex flex-wrap items-end gap-3"><label className="text-xs text-slate-500">From<input className="form-input mt-1" type="date" name="from" defaultValue={params.from||from.toISOString().slice(0,10)}/></label><label className="text-xs text-slate-500">To<input className="form-input mt-1" type="date" name="to" defaultValue={params.to||to.toISOString().slice(0,10)}/></label><button className="btn-primary">Apply range</button></form><div className="admin-stat-grid mt-8"><Stat label="Gross revenue" value={`${gross.toLocaleString()} MMK`}/><Stat label="Refunds" value={`${refundTotal.toLocaleString()} MMK`}/><Stat label="Net revenue" value={`${net.toLocaleString()} MMK`}/><Stat label="Paid transactions" value={paidTransactions}/><Stat label="Customers in range" value={customers}/><Stat label="Average transaction" value={`${(paidTransactions?Math.round(gross/paidTransactions):0).toLocaleString()} MMK`}/><Stat label="Active buyers" value={uniqueCustomers}/></div><div className="mt-8 grid gap-6 lg:grid-cols-3"><section className="admin-panel"><h2 className="font-semibold">Revenue sources</h2><div className="mt-5 space-y-3"><Row label="Templates" value={marketplace}/><Row label="Courses" value={coursesRevenue}/><Row label="Services" value={projects}/></div></section><section className="admin-panel"><h2 className="font-semibold">Metric definitions</h2><p className="mt-4 text-sm leading-6 text-slate-400">Gross is verified paid order, course, and collected invoice amounts. Net is gross minus completed refunds. Project revenue uses verified amount paid, not invoice totals.</p></section><section className="admin-panel"><h2 className="font-semibold">Marketing controls</h2><p className="mt-4 text-sm text-slate-400">Live campaigns and bulk email are not activated. Consent and campaign records are available for controlled setup.</p><Link href="/admin/marketing/subscribers" className="mt-4 inline-block text-sm text-violet-300">Review consent →</Link></section></div></main>;
}
function Stat({label,value}:{label:string;value:string|number}){return <div className="admin-stat"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>}
function Row({label,value}:{label:string;value:number}){return <div className="flex justify-between border-b border-white/10 pb-3 text-sm"><span className="text-slate-400">{label}</span><strong>{value.toLocaleString()} MMK</strong></div>}
