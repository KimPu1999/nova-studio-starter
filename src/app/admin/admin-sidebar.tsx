'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowLeftRight,BarChart3,BriefcaseBusiness,Code2,CreditCard,FileText,FolderKanban,KeyRound,LayoutDashboard,LogOut,Package,PanelTop,Receipt,Settings,Star,Ticket,Wallet,WalletCards,Users,X} from 'lucide-react';
import {usePathname} from 'next/navigation';

const items=[
  ['/admin','Overview',LayoutDashboard],['/admin/billing','Billing',WalletCards],['/admin/billing/subscriptions','Subscriptions',CreditCard],['/admin/billing/payments','SaaS payments',Wallet],['/admin/billing/reconciliation','Reconciliation',Receipt],['/admin/support','Support',Ticket],['/admin/help','Help center',PanelTop],['/admin/refunds','Refunds',WalletCards],['/admin/cms','CMS',PanelTop],['/admin/blog','Blog',FileText],['/admin/courses','Courses',PanelTop],['/admin/lms/analytics','LMS analytics',BarChart3],['/admin/lms/payments','Course payments',FolderKanban],['/admin/templates','Templates',Package],['/admin/services','Services',BriefcaseBusiness],['/admin/project-requests','Project requests',FileText],['/admin/proposals','Proposals',FileText],['/admin/projects','Projects',BriefcaseBusiness],['/admin/project-invoices','Project invoices',FileText],['/admin/categories','Categories',FolderKanban],['/admin/orders','Orders',Package],['/admin/payments','Payment reviews',FolderKanban],['/admin/payments/transactions','Transactions',Receipt],['/admin/payments/settings','Payment settings',Settings],['/admin/vendors/applications','Vendor applications',Users],['/admin/vendors/payouts','Vendor payouts',ArrowLeftRight],['/admin/license-types','License types',KeyRound],['/admin/licenses','Licenses',KeyRound],['/admin/reviews','Reviews',Star],['/admin/coupons','Coupons',Ticket],['/admin/analytics','Analytics',BarChart3],['/admin/payment-methods','Payment methods',Settings],['/admin/developers','Developer platform',Code2],['/admin/settings','Settings',Settings],
] as const;
type LogoutAction=()=>Promise<void>;

export function AdminSidebar({email,logoutAction}:{email:string;logoutAction:LogoutAction}){
  const pathname=usePathname();
  const activeHref=items.reduce((best,[href])=>(pathname===href||pathname.startsWith(`${href}/`))&&href.length>best.length?href:best,'');
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>{const openMenu=()=>setOpen(true);const closeMenu=()=>setOpen(false);window.addEventListener('nova:admin-menu',openMenu);window.addEventListener('nova:admin-menu-close',closeMenu);return()=>{window.removeEventListener('nova:admin-menu',openMenu);window.removeEventListener('nova:admin-menu-close',closeMenu)}},[]);
  useEffect(()=>{
    try{setCollapsed(window.localStorage.getItem('nova:admin-sidebar')==='collapsed')}catch{}
    const toggle=()=>setCollapsed(value=>{const next=!value;try{window.localStorage.setItem('nova:admin-sidebar',next?'collapsed':'expanded')}catch{}return next});
    window.addEventListener('nova:admin-sidebar-toggle',toggle);
    return()=>window.removeEventListener('nova:admin-sidebar-toggle',toggle);
  },[]);
  useEffect(()=>{document.documentElement.dataset.adminSidebar=collapsed?'collapsed':'expanded'},[collapsed]);
  useEffect(()=>setOpen(false),[pathname]);
  return <>
    <div className={`admin-sidebar-backdrop ${open?'is-visible':''}`} onClick={()=>setOpen(false)} aria-hidden="true"/>
    <aside className={`admin-sidebar ${open?'is-open':''} ${collapsed?'is-collapsed':''}`} aria-label="Admin navigation">
      <div className="admin-sidebar-header"><Link href="/admin" className="brand-mark" onClick={()=>setOpen(false)}><span className="brand-symbol">✳</span><span className="brand-name">NOVA<span className="text-violet-400">.</span></span></Link><button type="button" className="admin-sidebar-close" onClick={()=>setOpen(false)} aria-label="Close admin navigation"><X size={19}/></button></div>
      <nav className="admin-sidebar-nav">{items.map(([href,label,Icon])=>{const active=activeHref===href;return <Link href={href} prefetch={false} key={href} className={`admin-sidebar-link ${active?'is-active':''}`} aria-current={active?'page':undefined} onClick={()=>setOpen(false)}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>})}</nav>
      <div className="admin-sidebar-footer"><p className="truncate text-xs text-slate-500">{email}</p><form action={logoutAction}><button className="admin-nav mt-4 w-full"><LogOut size={17}/><span>Sign out</span></button></form></div>
    </aside>
  </>;
}
