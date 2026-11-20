import Link from 'next/link';
import {ArrowUpRight,Package,FolderKanban,Inbox,Plus,WalletCards,Users} from 'lucide-react';
import {prisma,databaseConfigured} from '@/lib/prisma';
import {requireAdmin} from '@/lib/auth';

export const dynamic='force-dynamic';

export default async function AdminDashboard(){
  await requireAdmin();
  const metrics=databaseConfigured?await Promise.all([
    prisma.template.count(),
    prisma.template.count({where:{status:'PUBLISHED'}}),
    prisma.template.count({where:{status:'DRAFT'}}),
    prisma.template.count({where:{status:'ARCHIVED'}}),
    prisma.category.count(),
    prisma.inquiry.count(),
    prisma.order.count(),
    prisma.order.count({where:{status:'PAYMENT_REVIEW'}}),
    prisma.order.count({where:{status:'PAID'}}),
    prisma.order.aggregate({where:{status:'PAID'},_sum:{totalMmk:true}}),
    prisma.user.count({where:{role:{code:'CUSTOMER'}}}),
    prisma.auditLog.findMany({take:6,orderBy:{createdAt:'desc'},select:{id:true,action:true,entity:true,createdAt:true}}),
  ]):null;
  const [total,published,draft,archived,categories,inquiries,orders,pendingPayments,paidOrders,revenue,customers,activity]=metrics||[0,0,0,0,0,0,0,0,0,{_sum:{totalMmk:null}},0,[]];

  return <main className="admin-content admin-dashboard">
    <div className="admin-dashboard-header">
      <div><p className="eyebrow">OVERVIEW</p><h1 className="admin-title">Good to see you.</h1><p className="admin-page-lead">A quick pulse on your studio marketplace.</p></div>
      <Link href="/admin/templates/new" className="btn-primary"><Plus size={17}/> New template</Link>
    </div>

    <section className="admin-dashboard-stats" aria-label="Marketplace metrics">
      <Stat label="Total templates" value={total} icon={Package}/><Stat label="Published" value={published} icon={ArrowUpRight} accent/><Stat label="Orders" value={orders} icon={Package}/><Stat label="Verified revenue" value={`${(revenue?._sum?.totalMmk||0).toLocaleString()} MMK`} icon={WalletCards} accent/>
      <Stat label="Drafts" value={draft} icon={Package}/><Stat label="Archived" value={archived} icon={Package}/><Stat label="Pending payments" value={pendingPayments} icon={WalletCards} accent/><Stat label="Paid orders" value={paidOrders} icon={ArrowUpRight}/>
      <Stat label="Categories" value={categories} icon={FolderKanban}/><Stat label="Inquiries" value={inquiries} icon={Inbox}/><Stat label="Customers" value={customers} icon={Users}/>
    </section>

    <div className="admin-dashboard-lower">
      <section className="admin-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2 className="admin-section-title">Recent activity</h2></div><span className="admin-section-meta">Latest actions</span></div>
        {activity.length?<div className="admin-activity-list">{activity.map(a=><div key={a.id} className="admin-activity-row"><span className="admin-activity-dot" aria-hidden="true"/><span className="admin-activity-copy"><b>{a.action}</b><span>{a.entity}</span></span><time dateTime={a.createdAt.toISOString()}>{a.createdAt.toLocaleDateString()}</time></div>)}</div>:<Empty text={databaseConfigured?'No activity yet.':'Connect PostgreSQL to see activity.'}/>}
      </section>
      <section className="admin-panel">
        <div className="admin-section-heading"><div><p className="eyebrow">SHORTCUTS</p><h2 className="admin-section-title">Quick actions</h2></div></div>
        <div className="admin-quick-actions"><Link className="quick-action" href="/admin/templates/new"><Plus size={17}/> Add template <ArrowUpRight size={15}/></Link><Link className="quick-action" href="/admin/payments"><WalletCards size={17}/> Review payments <ArrowUpRight size={15}/></Link><Link className="quick-action" href="/admin/payment-methods"><FolderKanban size={17}/> Configure wallets <ArrowUpRight size={15}/></Link></div>
      </section>
    </div>
  </main>;
}

function Stat({label,value,icon:Icon,accent}:{label:string;value:number|string;icon:typeof Package;accent?:boolean}){return <div className={`admin-stat ${accent?'admin-stat-accent-card':''}`}><div className={`admin-stat-icon ${accent?'admin-stat-accent':''}`}><Icon size={17}/></div><p className="admin-stat-value">{value}</p><p className="admin-stat-label">{label}</p></div>}
function Empty({text}:{text:string}){return <div className="admin-empty">{text}</div>}
