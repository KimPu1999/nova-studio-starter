import { WorkspaceMemberRole } from '@prisma/client';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { requireUser } from './auth';

export type WorkspacePermission = 'workspace.read' | 'workspace.update' | 'members.invite' | 'members.manage' | 'projects.create' | 'projects.read' | 'projects.edit' | 'projects.review' | 'assets.manage' | 'clients.manage' | 'billing.read' | 'billing.manage' | 'credits.manage' | 'audit.read';

const permissions: Record<WorkspaceMemberRole, WorkspacePermission[]> = {
  OWNER: ['workspace.read', 'workspace.update', 'members.invite', 'members.manage', 'projects.create', 'projects.read', 'projects.edit', 'projects.review', 'assets.manage', 'clients.manage', 'billing.read', 'billing.manage', 'credits.manage', 'audit.read'],
  ADMIN: ['workspace.read', 'workspace.update', 'members.invite', 'members.manage', 'projects.create', 'projects.read', 'projects.edit', 'projects.review', 'assets.manage', 'clients.manage', 'billing.read', 'billing.manage', 'credits.manage', 'audit.read'],
  MANAGER: ['workspace.read', 'members.invite', 'members.manage', 'projects.create', 'projects.read', 'projects.edit', 'projects.review', 'assets.manage', 'clients.manage', 'billing.read', 'audit.read'],
  EDITOR: ['workspace.read', 'projects.create', 'projects.read', 'projects.edit', 'assets.manage'],
  DEVELOPER: ['workspace.read', 'projects.read', 'projects.edit', 'assets.manage'],
  VIEWER: ['workspace.read', 'projects.read'],
};

export function hasWorkspacePermission(role: WorkspaceMemberRole, permission: WorkspacePermission) { return permissions[role].includes(permission); }

export async function requireWorkspaceAccess(slug: string, permission: WorkspacePermission = 'workspace.read') {
  const user = await requireUser();
  const workspace = await prisma.workspace.findUnique({ where: { slug }, include: { organization: true, members: { where: { userId: user.id }, take: 1 } } });
  const membership = workspace?.members[0];
  if (!workspace || !membership || !hasWorkspacePermission(membership.role, permission)) redirect('/workspaces');
  return { user, workspace, membership };
}

export function normalizeWorkspaceSlug(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50); }
