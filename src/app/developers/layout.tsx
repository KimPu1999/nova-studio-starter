import Link from 'next/link';
import '../admin/admin.css';
import '../admin/responsive.css';
import { currentUser } from '@/lib/auth';

const nav = [
  { href: '/developers', label: 'Overview' },
  { href: '/developers/docs', label: 'Docs' },
  { href: '/developers/quickstart', label: 'Quickstart' },
  { href: '/developers/api-keys', label: 'API keys' },
  { href: '/developers/apps', label: 'OAuth apps' },
  { href: '/developers/webhooks', label: 'Webhooks' },
  { href: '/developers/integrations', label: 'Integrations' },
  { href: '/developers/sandbox', label: 'Sandbox' },
  { href: '/developers/usage', label: 'Usage' },
  { href: '/developers/changelog', label: 'Changelog' },
];

export const dynamic = 'force-dynamic';

export default async function DevelopersLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link href="/" className="brand-mark"><span className="brand-symbol">✳</span> NOVA<span className="text-violet-400">.</span></Link>
        <p className="mt-6 text-xs uppercase tracking-widest text-slate-500">Developer platform</p>
        <nav className="mt-4 space-y-2">
          {nav.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
        <div className="mt-auto">
          {user ? <p className="truncate text-xs text-slate-500">{user.email}</p> : <Link href="/login" className="admin-nav">Sign in</Link>}
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span className="text-sm text-slate-400">Developers / <span className="text-slate-200">NOVA API</span></span>
          <span className="ml-auto rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-200">API v1</span>
        </header>
        {children}
      </div>
    </div>
  );
}
