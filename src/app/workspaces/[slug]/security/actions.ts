'use server';

import { revalidatePath } from 'next/cache';
import { csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requireWorkspaceAccess } from '@/lib/workspaces';

export async function saveWorkspaceSecurityPolicy(formData: FormData) {
  const slug = String(formData.get('slug') || '');
  const access = await requireWorkspaceAccess(slug, 'workspace.update');
  await csrfCheck();
  const requireMfa = String(formData.get('requireMfa')) === 'true';
  const sessionDurationHours = Number(formData.get('sessionDurationHours'));
  const invitationExpiryDays = Number(formData.get('invitationExpiryDays'));
  if (!Number.isInteger(sessionDurationHours) || sessionDurationHours < 1 || sessionDurationHours > 720) throw new Error('Invalid session duration.');
  if (!Number.isInteger(invitationExpiryDays) || invitationExpiryDays < 1 || invitationExpiryDays > 30) throw new Error('Invalid invitation expiry.');
  await prisma.securityPolicy.upsert({ where: { workspaceId: access.workspace.id }, update: { requireMfa, sessionDurationHours, invitationExpiryDays, updatedById: access.user.id }, create: { workspaceId: access.workspace.id, requireMfa, sessionDurationHours, invitationExpiryDays, allowedEmailDomains: [], updatedById: access.user.id } });
  await prisma.workspaceAuditLog.create({ data: { workspaceId: access.workspace.id, actorId: access.user.id, action: 'SECURITY_POLICY_UPDATED', resource: 'SecurityPolicy', metadata: { requireMfa, sessionDurationHours, invitationExpiryDays } } });
  revalidatePath(`/workspaces/${slug}/security`);
}
