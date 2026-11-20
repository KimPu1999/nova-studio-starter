import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {money} from '@/lib/data';
import {PaymentForm} from './payment-form';

export const dynamic='force-dynamic';
export default async function PaymentPage({params}:{params:Promise<{orderId:string}>}){
  const user=await requireUser();const {orderId}=await params;
  const order=await prisma.order.findFirst({where:{id:orderId,userId:user.id},include:{items:{include:{template:true}},payments:{include:{paymentMethod:true,review:true},orderBy:{createdAt:'desc'}}}});
  if(!order)notFound();
  const methods=await prisma.paymentMethod.findMany({where:{isEnabled:true},orderBy:{displayOrder:'asc'}});
  const latest=order.payments[0];
  return <main className="commerce-page container-wide page-pad">
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4"><Link href={`/account/orders/${order.id}`} className="text-sm text-slate-400">← Back to order</Link><span className="commerce-status commerce-status-review">Manual payment review</span></div>
    <div className="commerce-hero"><span className="eyebrow">ORDER {order.orderNumber}</span><h1 className="page-title">Complete your <span className="gradient-text">payment.</span></h1><p className="page-description">Transfer the exact amount below, then submit your receipt. A NOVA reviewer will check the transfer before your digital access is released.</p></div>
    <div className="commerce-checkout-grid">
      <section className="space-y-6">
        <div className="commerce-card"><div className="commerce-card-heading"><div><span className="commerce-kicker">YOUR ORDER</span><h2 className="commerce-section-title">What you are buying</h2></div><span className="text-sm text-slate-400">{order.currency}</span></div><div className="space-y-4">{order.items.map(item=><div key={item.id} className="flex gap-4 border-b border-white/10 pb-4 last:border-0 last:pb-0">{item.template?.thumbnailUrl?<img loading="lazy" decoding="async" src={item.template.thumbnailUrl} alt="" className="h-16 w-24 rounded-lg object-cover"/>:<div className="h-16 w-24 rounded-lg bg-white/5"/>}<div className="min-w-0"><p className="font-semibold text-white">{item.templateName}</p><p className="mt-1 text-sm text-slate-400">{item.licenseTypeCode||'Digital license'} · {money(item.unitPriceMmk)}</p></div></div>)}</div><div className="commerce-total-box mt-6"><p className="text-sm text-slate-400">Exact amount to transfer</p><p className="mt-1 text-3xl font-bold text-white">{money(order.totalMmk)}</p><p className="mt-2 text-xs text-slate-500">Reference: <span className="font-mono text-violet-200">{order.orderNumber}</span></p></div></div>
        <div className="commerce-card"><div className="commerce-card-heading"><div><span className="commerce-kicker">TRANSFER INSTRUCTIONS</span><h2 className="commerce-section-title">Choose a configured wallet</h2></div></div>{methods.length?<div className="grid gap-4 md:grid-cols-2">{methods.map(method=><article key={method.id} className="commerce-payment-method">{method.qrStorageKey&&<img className="mb-4 h-36 w-36 rounded-xl border border-white/10 bg-white object-contain" src={`/api/payment-methods/${method.id}/qr`} alt={`${method.name} payment QR code`}/>}<h3 className="font-semibold text-white">{method.name}</h3><p className="mt-3 text-sm text-slate-300">{method.accountHolderName||'Account holder details configured by NOVA'}</p><p className="mt-1 select-all font-mono text-sm text-cyan-200">{method.walletNumber||'Wallet number not configured'}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-400">{method.instructions}</p></article>)}</div>:<div className="commerce-empty"><p>Payment methods are being prepared. Please check back after an administrator configures a wallet.</p></div>}</div>
      </section>
      <PaymentForm orderId={order.id} methods={methods.map(m=>({id:m.id,name:m.name}))} latestStatus={latest?.status} latestReason={latest?.review?.rejectionReason||null}/>
    </div>
  </main>;
}
