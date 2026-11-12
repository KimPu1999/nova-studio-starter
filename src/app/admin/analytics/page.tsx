import {prisma} from '@/lib/prisma';
import {requireAdmin} from '@/lib/auth';
import {RoleCode} from '@prisma/client';
export const dynamic='force-dynamic';
export default async function Analytics(){
  await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]);
  const [paid,refunded,licenses,coupons]=await Promise.all([
    prisma.order.findMany({where:{status:'PAID'},select:{totalMmk:true,createdAt:true,items:{select:{templateName:true,licenseTypeCode:true,unitPriceMmk:true}}}}),
    prisma.order.aggregate({where:{status:'REFUNDED'},_sum:{totalMmk:true},_count:{_all:true}}),
    prisma.customerLicense.findMany({select:{priceMmk:true,licenseType:{select:{code:true}},product:{select:{name:true}}}}),
    prisma.couponRedemption.count({where:{redeemedAt:{not:null}}})
  ]);
  const revenue=paid.reduce((sum,o)=>sum+o.totalMmk,0);const byType=new Map<string,number>();for(const l of licenses)byType.set(l.licenseType.code,(byType.get(l.licenseType.code)||0)+l.priceMmk);const products=new Map<string,number>();for(const o of paid)for(const i of o.items)products.set(i.templateName,(products.get(i.templateName)||0)+1);const top=[...products.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
  return <main className="admin-content"><p className="eyebrow">OPERATIONS</p><h1 className="admin-title">Sales analytics</h1><p className="mb-8 mt-2 text-sm text-slate-400">Verified payments only. Refunds are excluded from net revenue.</p><div className="admin-stat-grid"><Stat label="Verified revenue" value={`${revenue.toLocaleString()} MMK`}/><Stat label="Paid orders" value={paid.length}/><Stat label="Average order" value={`${(paid.length?Math.round(revenue/paid.length):0).toLocaleString()} MMK`}/><Stat label="Refund totals" value={`${(refunded._sum.totalMmk||0).toLocaleString()} MMK`}/><Stat label="License sales" value={licenses.length}/><Stat label="Coupon redemptions" value={coupons}/></div><div className="mt-8 grid gap-6 lg:grid-cols-2"><section className="admin-panel"><h2 className="font-semibold">Revenue by license type</h2><div className="mt-5 space-y-3">{[...byType].map(([code,value])=><div className="flex justify-between border-b border-white/10 pb-3 text-sm" key={code}><span>{code}</span><strong>{value.toLocaleString()} MMK</strong></div>)}{!byType.size&&<div className="admin-empty">No verified license sales yet.</div>}</div></section><section className="admin-panel"><h2 className="font-semibold">Top-selling templates</h2><div className="mt-5 space-y-3">{top.map(([name,count])=><div className="flex justify-between border-b border-white/10 pb-3 text-sm" key={name}><span>{name}</span><strong>{count} item{count===1?'':'s'}</strong></div>)}{!top.length&&<div className="admin-empty">No paid orders yet.</div>}</div></section></div></main>;
}
function Stat({label,value}:{label:string;value:string|number}){return <div className="admin-stat"><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>}
