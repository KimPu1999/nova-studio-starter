/**
 * Phase 18 — billing RBAC and separation of duties.
 *
 * Finance operations (payment verification, refunds, reconciliation, ledger,
 * reports) require the FINANCE_ADMIN role. Platform operations (plan catalog,
 * subscription management, invoice issuance) are available to platform admins.
 * SUPER_ADMIN keeps full access; neither role may approve their own payment
 * submission or their own refund request.
 */
import { RoleCode } from '@prisma/client';
import { requireAdmin } from '@/lib/auth';

type AdminUser = Awaited<ReturnType<typeof requireAdmin>>;

const PLATFORM_ADMIN_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN];
const FINANCE_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.FINANCE_ADMIN];
const BILLING_VIEWER_ROLES: RoleCode[] = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.FINANCE_ADMIN];

/** Any admin who can view billing data (least privilege: read-only page access). */
export async function requireBillingViewer(): Promise<AdminUser> {
  return requireAdmin(BILLING_VIEWER_ROLES);
}

/** Platform admin: plan catalog, subscriptions, invoice issuance and voiding. */
export async function requireBillingPlatformAdmin(): Promise<AdminUser> {
  return requireAdmin(PLATFORM_ADMIN_ROLES);
}

/** Finance admin: payment verification, refunds, reconciliation, ledger, reports. */
export async function requireFinanceAdmin(): Promise<AdminUser> {
  return requireAdmin(FINANCE_ROLES);
}

/** Enforces separation of duties: a user may never review their own submission. */
export function assertNotSelfApproval(actorId: string, submittedById: string, what: string): void {
  if (actorId === submittedById) {
    throw new Error(`Separation of duties: ${what} cannot be approved by the person who submitted it.`);
  }
}
