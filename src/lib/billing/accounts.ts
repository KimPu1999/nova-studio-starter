/**
 * Phase 18 — unified billing accounts.
 *
 * Every user has at most one PERSONAL billing account; every organization has
 * at most one ORGANIZATION billing account. Uniqueness is enforced by the
 * `billingKey` unique constraint (USER:{id} / ORG:{id}), so concurrent creation
 * cannot produce duplicates. Workspace billing always flows through the
 * organization's billing account; platform and vendor financial records stay in
 * their own ledgers.
 */
import { prisma } from '@/lib/prisma';
import { billingAudit } from './audit';
import { hasWorkspacePermission } from '@/lib/workspaces';
import type { BillingAccount, User, Prisma } from '@prisma/client';

export type BillingAccountWithOrg = Prisma.BillingAccountGetPayload<{ include: { organization: true; owner: true } }>;

export function personalBillingKey(userId: string): string {
  return `USER:${userId}`;
}

export function organizationBillingKey(organizationId: string): string {
  return `ORG:${organizationId}`;
}

/** Returns the user's personal billing account, creating it on first use. */
export async function getOrCreatePersonalBillingAccount(userId: string, actorId?: string): Promise<BillingAccount> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  const account = await prisma.billingAccount.upsert({
    where: { billingKey: personalBillingKey(userId) },
    update: {},
    create: {
      billingKey: personalBillingKey(userId),
      type: 'PERSONAL',
      ownerUserId: userId,
      name: user.name || user.email,
      contactEmail: user.email,
    },
  });
  if (actorId) await billingAudit({ actorId, accountId: account.id, entityType: 'BillingAccount', entityId: account.id, action: 'ENSURED_PERSONAL_ACCOUNT' });
  return account;
}

/**
 * Returns the billing account that owns a workspace (its organization's
 * ORGANIZATION account, creating it if needed). The caller must hold
 * `billing.manage` on the workspace.
 */
export async function getWorkspaceBillingAccount(workspaceId: string, actor: User): Promise<BillingAccount> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: actor.id },
    include: { workspace: { include: { organization: true } } },
  });
  if (!membership || !hasWorkspacePermission(membership.role, 'billing.manage')) {
    throw new Error('You do not have billing access to this workspace.');
  }
  const organization = membership.workspace.organization;
  if (!organization) throw new Error('This workspace has no organization and cannot hold organization billing.');
  const owner = await prisma.user.findUnique({ where: { id: organization.ownerId }, select: { name: true, email: true } });
  return prisma.billingAccount.upsert({
    where: { billingKey: organizationBillingKey(organization.id) },
    update: {},
    create: {
      billingKey: organizationBillingKey(organization.id),
      type: 'ORGANIZATION',
      ownerUserId: organization.ownerId,
      organizationId: organization.id,
      name: organization.name,
      contactName: owner?.name,
      contactEmail: owner?.email,
    },
  });
}

/**
 * Resolves the billing account for a user viewing their own billing, ensuring
 * tenant isolation: personal accounts only, unless the user holds billing
 * access on the owning workspace.
 */
export async function requireBillingAccountAccess(accountId: string, user: User): Promise<BillingAccountWithOrg> {
  const account = await prisma.billingAccount.findUnique({
    where: { id: accountId },
    include: { organization: true, owner: true },
  });
  if (!account) throw new Error('Billing account not found.');
  if (account.ownerUserId === user.id) return account;
  if (account.organizationId) {
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id, workspace: { organizationId: account.organizationId } },
    });
    if (membership && hasWorkspacePermission(membership.role, 'billing.read')) return account;
  }
  throw new Error('You do not have access to this billing account.');
}

/** Lists billing accounts a user may see (personal first). */
export async function listBillingAccountsForUser(user: User): Promise<BillingAccount[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id, role: { in: ['OWNER', 'ADMIN', 'MANAGER'] } },
    include: { workspace: { select: { organizationId: true } } },
  });
  const orgIds = [...new Set(memberships.map((m) => m.workspace.organizationId).filter((v): v is string => Boolean(v)))];
  const accounts = await prisma.billingAccount.findMany({
    where: {
      isActive: true,
      OR: [{ ownerUserId: user.id }, orgIds.length ? { organizationId: { in: orgIds } } : {}],
    },
    orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
  });
  return accounts;
}

/** Updates billing contact/preferences — owner or organization billing manager only. */
export async function updateBillingAccount(
  accountId: string,
  user: User,
  patch: { contactName?: string; contactEmail?: string; contactPhone?: string; companyInfo?: string; preferences?: Record<string, unknown> },
): Promise<void> {
  await requireBillingAccountAccess(accountId, user);
  const before = await prisma.billingAccount.findUnique({ where: { id: accountId } });
  await prisma.billingAccount.update({
    where: { id: accountId },
    data: {
      contactName: patch.contactName,
      contactEmail: patch.contactEmail,
      contactPhone: patch.contactPhone,
      companyInfo: patch.companyInfo,
      preferences: (patch.preferences ?? undefined) as never,
    },
  });
  await billingAudit({ actorId: user.id, accountId, entityType: 'BillingAccount', entityId: accountId, action: 'UPDATE_BILLING_DETAILS', before, after: patch });
}
