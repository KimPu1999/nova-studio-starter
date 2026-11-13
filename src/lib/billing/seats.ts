/**
 * Phase 18 — seat-based billing guard (Phase 15 workspace memberships).
 *
 * Seats are counted consistently: assigned ACTIVE members plus PENDING
 * invitations both consume seats (documented policy: invited seats are
 * reserved). Enforced transactionally inside the invitation-creation
 * transaction to make concurrent invite races safe. Overage seats are never
 * charged automatically — the invite simply fails until seats are upgraded
 * through a paid (verified) plan change.
 */
import { prisma } from '@/lib/prisma';
import { resolveEntitlements } from './entitlements';
import { FEATURE_KEYS as FEATURE_KEY_CONSTANTS } from './constants';
import type { Prisma } from '@prisma/client';

export interface SeatUsage {
  assignedSeats: number;
  pendingInvitations: number;
  includedSeats: number | null;
  seatLimit: number | null;
}

export async function getSeatUsage(workspaceId: string, organizationId: string): Promise<SeatUsage> {
  const [members, invitations, entitlements] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.workspaceInvitation.count({ where: { workspaceId, status: 'PENDING' } }),
    resolveEntitlementsByOrganization(organizationId),
  ]);
  return {
    assignedSeats: members,
    pendingInvitations: invitations,
    includedSeats: entitlements.includedSeats,
    seatLimit: entitlements.seatLimit,
  };
}

/** Resolves workspace-family entitlements via the owning organization account. */
async function resolveEntitlementsByOrganization(organizationId: string) {
  const account = await prisma.billingAccount.findUnique({ where: { billingKey: `ORG:${organizationId}` } });
  if (!account) return { includedSeats: null as number | null, seatLimit: null as number | null };
  const rows = await prisma.billingEntitlement.findMany({
    where: { accountId: account.id, enabled: true, featureKey: { in: [FEATURE_KEY_CONSTANTS.SEATS_MAX, FEATURE_KEY_CONSTANTS.SEATS_INCLUDED] } },
  });
  const included = rows.find((r) => r.featureKey === FEATURE_KEY_CONSTANTS.SEATS_INCLUDED)?.valueInt ?? null;
  const max = rows.find((r) => r.featureKey === FEATURE_KEY_CONSTANTS.SEATS_MAX)?.valueInt ?? null;
  return { includedSeats: included, seatLimit: max };
}

/**
 * Throws when a seat is unavailable. Call inside the same transaction that
 * creates the membership/invitation (tx-based) to prevent concurrent bypass.
 */
export async function assertSeatAvailable(workspaceId: string, organizationId: string, tx?: Prisma.TransactionClient): Promise<void> {
  const client = tx ?? prisma;
  const [members, invitations, account] = await Promise.all([
    client.workspaceMember.count({ where: { workspaceId } }),
    client.workspaceInvitation.count({ where: { workspaceId, status: 'PENDING' } }),
    client.billingAccount.findUnique({ where: { billingKey: `ORG:${organizationId}` } }),
  ]);
  if (!account) return; // No billing account yet (e.g. legacy workspace) — do not block.
  const rows = await client.billingEntitlement.findMany({
    where: { accountId: account.id, enabled: true, featureKey: { in: [FEATURE_KEY_CONSTANTS.SEATS_MAX, FEATURE_KEY_CONSTANTS.SEATS_INCLUDED] } },
  });
  const max = rows.find((r) => r.featureKey === FEATURE_KEY_CONSTANTS.SEATS_MAX)?.valueInt ?? null;
  if (max === null) return; // Unlimited or plan not configured.
  const used = members + invitations;
  if (used >= max) {
    throw new Error(`Seat limit reached (${used}/${max}). Upgrade the plan or remove members before inviting.`);
  }
}

