'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeWorkspaceSlug, requireWorkspaceAccess } from '@/lib/workspaces';
import { WorkspaceMemberRole } from '@prisma/client';
import { emitWebhookEventSafely } from '@/lib/webhooks/events';
import { assertSeatAvailable } from '@/lib/billing/seats';

export async function createOrganization(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrfCheck();
  const name = String(formData.get('name') || '').trim().slice(0, 120);
  const slug = normalizeWorkspaceSlug(String(formData.get('slug') || ''));
  if (!name || !/^[a-z0-9-]{3,50}$/.test(slug)) return;
  const workspaceSlug = normalizeWorkspaceSlug(String(formData.get('workspaceSlug') || ''));
  if (!/^[a-z0-9-]{3,50}$/.test(workspaceSlug)) return;
  const organization = await prisma.$transaction(async (tx) => {
    const created = await tx.organization.create({ data: { name, slug, ownerId: user.id, createdById: user.id } });
    const workspace = await tx.workspace.create({ data: { organizationId: created.id, name: `${name} workspace`, slug: workspaceSlug } });
    await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: WorkspaceMemberRole.OWNER } });
    await tx.workspaceAuditLog.create({ data: { workspaceId: workspace.id, actorId: user.id, action: 'WORKSPACE_CREATED', resource: 'Workspace', resourceId: workspace.id } });
    return workspace;
  });
  revalidatePath('/workspaces');
  redirect(`/workspaces/${organization.slug}`);
}

export async function inviteWorkspaceMember(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const access = await requireWorkspaceAccess(slug, 'members.invite');
  await csrfCheck();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || 'VIEWER') as WorkspaceMemberRole;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.values(WorkspaceMemberRole).includes(role)) return;
  if (role === WorkspaceMemberRole.OWNER && access.membership.role !== WorkspaceMemberRole.OWNER) return;
  const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (target && await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: access.workspace.id, userId: target.id } } })) return;
  const token = crypto.randomBytes(32).toString('hex');
  await prisma.$transaction(async (tx) => {
    // Phase 18: enforce seat limits transactionally so concurrent invitations
    // cannot bypass the subscription's seat entitlement.
    await assertSeatAvailable(access.workspace.id, access.workspace.organizationId, tx);
    await tx.workspaceInvitation.create({ data: { workspaceId: access.workspace.id, email, role, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), invitedById: access.user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
  });
  await prisma.workspaceAuditLog.create({ data: { workspaceId: access.workspace.id, actorId: access.user.id, action: 'MEMBER_INVITED', resource: 'WorkspaceInvitation', metadata: { email, role } } });
  emitWebhookEventSafely(access.workspace.id, 'workspace.member.invited', { email, role, workspace: { id: access.workspace.id, name: access.workspace.name } });
  revalidatePath(`/workspaces/${slug}/members`);
}
