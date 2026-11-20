import Link from 'next/link';
import {ArrowLeft,Check,ChevronDown,LockKeyhole,ShieldCheck,ShoppingBag} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {getCart} from '@/lib/cart';
import {prisma} from '@/lib/prisma';
import {money} from '@/lib/data';
import {CheckoutForm} from './checkout-form';

export const dynamic='force-dynamic';

function CheckoutHeader(){
  return <header className="checkout-header"><div className="checkout-header-inner"><Link href="/" className="brand-mark"><span className="brand-symbol">✳</span>NOVA<span className="text-violet-400">.</span></Link><div className="checkout-header-actions"><Link href="/cart" className="checkout-back-link"><ArrowLeft size={16}/> Back to cart</Link><span className="checkout-secure"><LockKeyhole size={15}/> Secure checkout</span></div></div><nav className="checkout-progress" aria-label="Checkout progress"><span className="checkout-progress-step is-complete"><span><Check size={13}/></span>Cart</span><i aria-hidden="true"/><span className="checkout-progress-step is-current" aria-current="step"><span>2</span>Checkout</span><i aria-hidden="true"/><span className="checkout-progress-step"><span>3</span>Complete</span></nav></header>;
}

export default async function Checkout(){
  const user=await requireUser();
  const cart=await getCart(user.id);
  const items=cart?.items.filter(i=>i.template.status==='PUBLISHED')||[];
  const priced=await Promise.all(items.map(async i=>({item:i,price:i.licenseTypeId?await prisma.productLicensePrice.findUnique({where:{productId_licenseTypeId:{productId:i.templateId,licenseTypeId:i.licenseTypeId}},include:{licenseType:true}}):null})));
  const methods=await prisma.paymentMethod.findMany({where:{isEnabled:true},orderBy:{displayOrder:'asc'}});
  const total=priced.reduce((sum,x)=>sum+(x.price?.priceMmk||0),0);
  return <><CheckoutHeader/><main className="checkout-page"><div className="checkout-container">
    {!items.length?<div className="checkout-empty-state"><div className="checkout-empty-icon"><ShoppingBag size={25}/></div><p className="checkout-kicker">CHECKOUT</p><h1>Your cart is ready when you are.</h1><p>Return to your cart and add a published template before continuing.</p><Link href="/cart" className="btn-primary">Return to cart</Link></div>:<>
      <div className="checkout-intro"><p className="checkout-kicker">SECURE CHECKOUT</p><h1>Finish your order.</h1><p>Review your details and choose a payment method. Your order is created only after the server revalidates your cart and selected licenses.</p></div>
      <div className="checkout-layout"><section className="checkout-form-column"><CheckoutForm methods={methods}/></section><aside className="checkout-summary-wrap"><details className="checkout-summary-card" open><summary className="checkout-summary-toggle"><span><span className="checkout-summary-label">ORDER SUMMARY</span><strong>{priced.length} {priced.length===1?'template':'templates'}</strong></span><ChevronDown size={18}/></summary><div className="checkout-summary-body"><div className="checkout-summary-top"><span>Review your selection</span><Link href="/cart">Edit cart</Link></div><div className="checkout-summary-items">{priced.map(({item,price})=><article className="checkout-summary-item" key={item.id}><Link href={`/templates/${item.template.slug}`} className="checkout-item-image">{item.template.thumbnailUrl?<img src={item.template.thumbnailUrl} alt=""/>:<span>{item.template.name.slice(0,1)}</span>}</Link><div className="checkout-item-copy"><Link href={`/templates/${item.template.slug}`}>{item.template.name}</Link><span>{price?.licenseType.name||'License unavailable'}</span></div><strong>{price?money(price.priceMmk):'—'}</strong></article>)}</div><div className="checkout-price-list"><div><span>Subtotal</span><strong>{money(total)}</strong></div><div><span>Delivery</span><strong className="checkout-free">Digital</strong></div></div><div className="checkout-total-row"><span>Total</span><strong>{money(total)}</strong></div><div className="checkout-reassurance"><ShieldCheck size={17}/><span>Digital delivery after payment verification. Your payment details stay with the configured payment flow.</span></div></div></details></aside></div>
    </>}
  </div></main></>;
}
