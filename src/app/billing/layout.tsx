import '../admin/admin.css';
import '../admin/responsive.css';
import './billing.css';
import './billing-overrides.css';
import Link from 'next/link';
import {LogOut} from 'lucide-react';
import {requireUser} from '@/lib/auth';
import {customerLogoutAction} from '../customer-actions';
import {setBillingLanguageAction} from './actions';
import {getBillingLang} from '@/lib/billing/i18n';
import {BillingNav} from './nav';
export const dynamic='force-dynamic';
export default async function BillingLayout({children}:{children:React.ReactNode}){
  const user=await requireUser();
  const lang=await getBillingLang();
  const nav=[
    ['/billing','overview'],
    ['/billing/plans','plans'],
    ['/billing/subscription','subscription'],
    ['/billing/invoices','invoices'],
    ['/billing/payments','payments'],
    ['/billing/usage','usage'],
    ['/billing/credits','credits'],
    ['/billing/settings','settings'],
  ] as const;
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/account/dashboard" className="brand-mark"><span className="brand-symbol">✳</span> NOVA<span className="text-violet-400">.</span></Link>
      <BillingNav items={nav} lang={lang}/>
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
