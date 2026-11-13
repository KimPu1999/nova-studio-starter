import '../admin/admin.css';
import '../admin/responsive.css';
import './billing.css';
import Link from 'next/link';
import {CreditCard,FileText,Gauge,LayoutDashboard,LogOut,PackageOpen,Settings,Sparkles,Wallet} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {customerLogoutAction} from '../customer-actions';
import {setBillingLanguageAction} from './actions';
import {getBillingLang} from '@/lib/billing/i18n';
export const dynamic='force-dynamic';
export default async function BillingLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  const lang=await getBillingLang();
  const nav=[
    ['/billing','overview',LayoutDashboard],
    ['/billing/plans','plans',PackageOpen],
    ['/billing/subscription','subscription',CreditCard],
    ['/billing/invoices','invoices',FileText],
    ['/billing/payments','payments',Wallet],
    ['/billing/usage','usage',Gauge],
    ['/billing/credits','credits',Sparkles],
    ['/billing/settings','settings',Settings],
  ] as const;
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/account/dashboard" className="brand-mark"><span className="brand-symbol">✳</span> NOVA<span className="text-violet-400">.</span></Link>
      <nav className="mt-12 space-y-2">
        {nav.map(([href,key,Icon])=><Link href={href} key={href}><Icon size={17}/>{lang==='mm'?({overview:'ခြုံငံချုပ်',plans:'အစီအစဉ်များ',subscription:'စာရင်းသွင်းမှု',invoices:'ငွေစာရင်း',payments:'ငွေပေးချေမှု',usage:'အသုံးပြုမှု',credits:'AI ကရေဒစ်',settings:'ဆက်တင်များ'} as Record<string,string>)[key]:({overview:'Overview',plans:'Plans',subscription:'Subscription',invoices:'Invoices',payments:'Payments',usage:'Usage',credits:'AI Credits',settings:'Settings'} as Record<string,string>)[key]}</Link>)}
      </nav>
      <div className="mt-auto space-y-3">
        <form action={setBillingLanguageAction}>
          <input type="hidden" name="lang" value={lang==='mm'?'en':'mm'}/>
          <button className="admin-nav w-full text-xs" type="submit">{lang==='mm'?'English':'မြန်မာ'}</button>
        </form>
        <form action={customerLogoutAction}><button className="admin-nav w-full"><LogOut size={17}/>Sign out</button></form>
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <Link href="/account/dashboard" className="text-sm text-slate-400">← {lang==='mm'?'အကောင့်':'Account'}</Link>
        <span className="ml-auto text-sm text-slate-300">{user.name}</span>
      </header>
      {children}
    </div>
  </div>;
}
