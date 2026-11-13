'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {CreditCard,FileText,Gauge,LayoutDashboard,PackageOpen,Settings,Sparkles,Wallet} from 'lucide-react';

const icons={overview:LayoutDashboard,plans:PackageOpen,subscription:CreditCard,invoices:FileText,payments:Wallet,usage:Gauge,credits:Sparkles,settings:Settings};

export function BillingNav({items,lang}:{items:ReadonlyArray<readonly [string,string]>;lang:'en'|'mm'}){
  const pathname=usePathname();
  const labels=lang==='mm'?{overview:'ခြုံငုံချက်',plans:'အစီအစဉ်များ',subscription:'စာရင်းသွင်းမှု',invoices:'ငွေစာရင်း',payments:'ငွေပေးချေမှု',usage:'အသုံးပြုမှု',credits:'AI ကရေဒစ်',settings:'ဆက်တင်များ'}:{overview:'Overview',plans:'Plans',subscription:'Subscription',invoices:'Invoices',payments:'Payments',usage:'Usage',credits:'AI Credits',settings:'Settings'};
  return <nav className="billing-nav" aria-label={lang==='mm'?'ငွေစာရင်းမီနူး':'Billing navigation'}>{items.map(([href,key])=>{const active=key==='overview'?pathname==='/billing':pathname===href||pathname.startsWith(href+'/');const Icon=icons[key as keyof typeof icons];return <Link href={href} key={href} className={active?'active':''} aria-current={active?'page':undefined}><Icon size={17}/>{labels[key as keyof typeof labels]}</Link>})}</nav>;
}
