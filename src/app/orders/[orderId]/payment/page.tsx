import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {money} from '@/lib/data';
import {PaymentForm} from './payment-form';

export const dynamic='force-dynamic';

export default async function PaymentPage({params}:{params:Promise<{orderId:string}>}){
  const user=await requireUser();
  const {orderId}=await params;
  const order=await prisma.order.findFirst({where:{id:orderId,userId:user.id},include:{items:true}});
  if(!order)notFound();
  const methods=await prisma.paymentMethod.findMany({where:{isEnabled:true},orderBy:{displayOrder:'asc'}});
  return <main className="commerce-page container-wide page-pad">
    <div className="commerce-hero"><span className="eyebrow">STEP 2 OF 2 · MANUAL PAYMENT</span><h1 className="page-title">Pay and <span className="gradient-text">submit proof.</span></h1><p className="page-description">Order {order.orderNumber} · exact amount {money(order.totalMmk)}. Complete the transfer using the instructions below, then upload your proof.</p></div>
    <div className="commerce-checkout-grid">
      <section className="commerce-card">
        <div className="commerce-card-heading"><div><span className="commerce-kicker">PAYMENT DETAILS</span><h2 className="commerce-section-title">Choose a payment method</h2></div><span className="commerce-status commerce-status-review">Manual review</span></div>
        {methods.length?<div className="commerce-payment-methods">{methods.map(method=><div key={method.id} className="commerce-payment-method"><div className="flex items-start justify-between gap-4"><p className="font-semibold text-white">{method.name}</p><span className="text-xs text-slate-500">Verified after review</span></div>{method.qrStorageKey&&<img className="mt-4 h-36 w-36 rounded-xl border border-white/10 bg-white object-contain" src={`/api/payment-methods/${method.id}/qr`} alt={`${method.name} payment QR code`}/>}<p className="mt-4 text-sm text-slate-300">{method.accountHolderName||'Account details configured by NOVA'}</p><p className="mt-1 select-all font-mono text-sm text-cyan-200">{method.walletNumber||'Wallet details not configured'}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-400">{method.instructions}</p></div>)}</div>:<div className="commerce-empty"><p>Payment methods are not configured yet.</p></div>}
        <div className="commerce-total-box"><p className="text-sm text-slate-400">Exact amount to transfer</p><p className="mt-1 text-3xl font-bold text-white">{money(order.totalMmk)}</p></div>
      </section>
      <PaymentForm orderId={order.id} methods={methods.map(m=>({id:m.id,name:m.name}))}/>
    </div>
  </main>
}
