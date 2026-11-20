import './responsive.css';
import './admin.css';
import {currentUser} from '@/lib/auth';
import {logoutAction} from './actions';
import {AdminBackButton} from './admin-back-button';
import {AdminMenuButton} from './admin-menu-button';
import {AdminSidebarToggle} from './admin-sidebar-toggle';
import {AdminSidebar} from './admin-sidebar';
export const dynamic='force-dynamic';
export default async function AdminLayout({children}:{children:React.ReactNode}){const user=await currentUser();if(!user)return <>{children}</>;return <div className="admin-shell admin-app-shell"><AdminSidebar email={user.email} logoutAction={logoutAction}/><div className="admin-main"><header className="admin-topbar"><AdminBackButton/><AdminMenuButton/><AdminSidebarToggle/><span className="text-sm text-slate-400">Workspace / <span className="text-slate-200">Admin</span></span><span className="ml-auto rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-xs text-violet-200">{user.role.name}</span></header>{children}</div></div>}
