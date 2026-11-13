import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { csrfCheck, requireAdmin } from '@/lib/auth';
import { RoleCode } from '@prisma/client';
import { prismaAudit } from '@/lib/api/audit';

/** Admin-only quota policy editor. Values are clamped to sane bounds. */
export async function upsertQuotaPolicyAction(formData: FormData) {
  const admin = await requireAdmin([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]);
  await csrfCheck();
  const workspaceId = String(formData.get('workspaceId') || '');
  const perMinute = Math.min(600, Math.max(5, Number(formData.get('requestsPerMinute')) || 0));
  const monthly = Math.min(2_000_000, Math.max(100, Number(formData.get('monthlyRequests')) || 0));
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error('Invalid workspace.');
  if (!perMinute || !monthly) throw new Error('Provide numeric limits.');

  const existing = await prisma.apiQuotaPolicy.findUnique({ where: { workspaceId } });
  const policy = existing
    ? await prisma.apiQuotaPolicy.update({ where: { workspaceId }, data: { requestsPerMinute: perMinute, monthlyRequests: monthly } })
    : await prisma.apiQuotaPolicy.create({ data: { workspaceId, requestsPerMinute: perMinute, monthlyRequests: monthly } });

  await prismaAudit({ userId: admin.id, workspaceId, action: existing ? 'quota.policy.update' : 'quota.policy.create', metadata: { requestsPerMinute: policy.requestsPerMinute, monthlyRequests: policy.monthlyRequests } });
  revalidatePath('/admin/developers/limits');
  revalidatePath('/admin/developers');
}

export async function deleteQuotaPolicyAction(formData: FormData) {
  const admin = await requireAdmin([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]);
  await csrfCheck();
  const workspaceId = String(formData.get('workspaceId') || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId)) throw new Error('Invalid workspace.');
  await prisma.apiQuotaPolicy.deleteMany({ where: { workspaceId } });
  await prismaAudit({ userId: admin.id, workspaceId, action: 'quota.policy.delete' });
  revalidatePath('/admin/developers/limits');
}

/** Disables a sandbox environment (never reveals or resets its key). */
export async function disableSandboxAdminAction(formData: FormData) {
  const admin = await requireAdmin([RoleCode.SUPER_ADMIN, RoleCode.ADMIN]);
  await csrfCheck();
  const id = String(formData.get('id') || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error('Invalid sandbox.');
  const sandbox = await prisma.developerSandbox.update({ where: { id }, data: { status: 'DISABLED' } });
  await prismaAudit({ userId: admin.id, workspaceId: sandbox.workspaceId, action: 'sandbox.admin_disable', metadata: { sandboxId: id } });
  revalidatePath('/admin/developers');
}
