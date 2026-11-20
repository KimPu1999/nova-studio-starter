'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import {ArrowRight,CheckCircle2,Clock3,Download,ExternalLink,RefreshCw,XCircle} from 'lucide-react';

type Item={name:string;license:string|null;priceMmk:number;imageUrl:string|null};
type Props={orderId:string;orderNumber:string;customerName:string;currency:string;totalMmk:number;items:Item[];initialStatus:string;kind:'success'|'failed'|'cancelled'|'processing'};

const money=(value:number,currency:string)=>`${value.toLocaleString()} ${currency}`;

export function CheckoutResult({orderId,orderNumber,customerName,currency,totalMmk,items,initialStatus,kind}:Props){
  const [status,setStatus]=useState(initialStatus);
  const [checking,setChecking]=useState(initialStatus!=='PAID'&&kind!=='failed'&&kind!=='cancelled');

  useEffect(()=>{
    if(status==='PAID'||kind==='failed'||kind==='cancelled')return;
    let stopped=false;
    const check=async()=>{
      try{
        const response=await fetch(`/api/orders/${orderId}/payment`,{cache:'no-store'});
        if(!response.ok)return;
        const data=await response.json() as {status?:string};
        if(!stopped&&data.status){setStatus(data.status);if(data.status==='PAID')setChecking(false);}
      }catch{}
    };
    void check();
    const timer=window.setInterval(check,5000);
    return()=>{stopped=true;window.clearInterval(timer)};
  },[kind,orderId,status]);

  const paid=status==='PAID';
  const cancelled=status==='CANCELLED'||status==='REFUNDED'||kind==='cancelled';
  const failed=kind==='failed';
  const processing=!paid&&!cancelled&&!failed;
  const heading=paid?'Payment confirmed.':cancelled?'Payment cancelled.':failed?'Payment could not be completed.':'Payment processing.';
  const description=paid?'Your payment was verified by NOVA Studio. Your purchased files and licenses are now available.':cancelled?'This order was cancelled and no download access was granted.':failed?'No payment was confirmed for this order. You can return to the order and try again.':'Your order is safe while we check the payment status. Access is released only after the server confirms payment.';
  return <main className="checkout-result-page">
    <div className="checkout-result-shell">
      <div className={`checkout-result-icon ${paid?'is-paid':cancelled||failed?'is-failed':'is-processing'}`}>{paid?<CheckCircle2 size={34}/>:cancelled||failed?<XCircle size={34}/>:<Clock3 size={34}/>}</div>
      <p className="checkout-kicker">NOVA STUDIO · ORDER {orderNumber}</p>
      <h1>{heading}</h1>
      <p className="checkout-result-copy">{description}</p>
      {processing&&<div className="checkout-processing-note"><RefreshCw size={16} className={checking?'checkout-result-spin':''}/><span>{status==='PAYMENT_REVIEW'?'An authorized reviewer is checking your transfer.':'Waiting for a verified payment confirmation.'}</span></div>}
      <section className="checkout-result-card">
        <div className="checkout-result-card-top"><div><span className="checkout-result-label">ORDER DETAILS</span><p className="checkout-result-customer">{customerName}</p></div><span className={`commerce-status ${paid?'paid':'pending'}`}>{status.replaceAll('_',' ')}</span></div>
        <div className="checkout-result-items">{items.map(item=><div className="checkout-result-item" key={`${item.name}-${item.license}`}>
          <div className="checkout-result-thumb">{item.imageUrl?<img src={item.imageUrl} alt=""/>:<span>{item.name.slice(0,1)}</span>}</div><div className="min-w-0 flex-1"><p>{item.name}</p><small>{item.license||'Digital license'}</small></div><strong>{money(item.priceMmk,currency)}</strong>
        </div>)}</div>
        <div className="checkout-result-total"><span>Total · {currency}</span><strong>{money(totalMmk,currency)}</strong></div>
      </section>
      <div className="checkout-result-actions">
        {paid&&<Link className="btn-primary" href="/account/downloads"><Download size={17}/> Download templates <ArrowRight size={16}/></Link>}
        {processing&&<Link className="btn-primary" href={`/orders/${orderId}/payment`}>Open payment instructions <ArrowRight size={16}/></Link>}
        {(failed||cancelled)&&<Link className="btn-primary" href={`/account/orders/${orderId}`}>View order <ExternalLink size={16}/></Link>}
        <Link className="btn-outline" href="/templates">Back to templates</Link>
      </div>
    </div>
  </main>;
}
