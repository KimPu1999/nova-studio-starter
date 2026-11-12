import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function MfaSecurityPage() { const user = await requireUser(); const credential = await prisma.mfaCredential.findUnique({ where: { userId: user.id }, select: { enabled: true, verifiedAt: true, lastUsedAt: true } }); return <main className="admin-content max-w-3xl"><p className="eyebrow">ACCOUNT SECURITY</p><h1 className="admin-title">Multi-factor authentication.</h1><p className="mt-2 text-sm text-slate-400">Status: {credential?.enabled ? 'Enabled' : 'Not enrolled'}.</p><section className="admin-panel mt-8"><h2 className="font-semibold">Authenticator app</h2><p className="mt-3 text-sm leading-6 text-slate-400">TOTP enrollment requires a vetted server-side library and verification flow. It is not activated in this environment, so no secret or recovery code is displayed.</p><Link href="/account/security/sessions" className="mt-5 inline-flex text-sm text-violet-300">Review sessions →</Link></section></main>; }
