import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminOrganizations() { await requireAdmin(); const [organizations, workspaces, members, sites] = await Promise.all([prisma.organization.count(), prisma.workspace.count(), prisma.workspaceMember.count(), prisma.hostedWebsite.count({ where: { deletedAt: null } })]); return <main className="admin-content max-w-6xl"><p className="eyebrow">PLATFORM CONTROL CENTER</p><h1 className="admin-title">Organizations.</h1><p className="mt-2 text-sm text-slate-400">Tenant-level counts only; private client content is not loaded into this overview.</p><div className="admin-stat-grid mt-8"><Stat label="Organizations" value={organizations}/><Stat label="Workspaces" value={workspaces}/><Stat label="Team memberships" value={members}/><Stat label="Hosted websites" value={sites}/></div></main>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="admin-stat"><p className="text-2xl font-bold">{value.toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{label}</p></div>; }
