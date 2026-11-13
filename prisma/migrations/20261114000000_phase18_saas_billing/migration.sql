-- Phase 18: SaaS subscription billing, unified invoicing, manual payment verification, usage metering, financial ledger and reconciliation.

-- CreateEnum
CREATE TYPE "BillingAccountType" AS ENUM ('PERSONAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "BillingPlanTier" AS ENUM ('FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "BillingPlanVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BillingSubscriptionStatus" AS ENUM ('INCOMPLETE', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingScopeType" AS ENUM ('PERSONAL', 'WORKSPACE', 'WEBSITE');

-- CreateEnum
CREATE TYPE "BillingSubscriptionItemType" AS ENUM ('PLAN_BASE', 'SEAT_ADDON', 'AI_CREDITS_ADDON', 'HOSTING_ADDON', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "BillingInvoiceLineType" AS ENUM ('SUBSCRIPTION_PLAN', 'SEATS', 'AI_CREDITS', 'HOSTING', 'API_USAGE', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "BillingPaymentMethod" AS ENUM ('KBZPAY', 'WAVEPAY', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "BillingPaymentAttemptStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCreditNoteType" AS ENUM ('REFUND', 'CREDIT_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingCreditNoteStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED', 'COMPLETED', 'VOID');

-- CreateEnum
CREATE TYPE "BillingUsageMeterCode" AS ENUM ('AI_TOKENS', 'AI_CREDITS', 'API_REQUESTS', 'HOSTING_STORAGE_MB', 'HOSTING_BANDWIDTH_MB', 'DEPLOYMENTS');

-- CreateEnum
CREATE TYPE "BillingUsageSubjectType" AS ENUM ('USER', 'WORKSPACE', 'WEBSITE', 'API_CREDENTIAL');

-- CreateEnum
CREATE TYPE "BillingUsageQuality" AS ENUM ('ESTIMATED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "BillingLedgerEntryType" AS ENUM ('CASH_RECEIPT', 'DEFERRED_REVENUE', 'REVENUE_RECOGNIZED', 'REVENUE_ADJUSTMENT', 'REFUND', 'CREDIT_NOTE_ISSUED', 'CREDIT_REVERSAL');

-- CreateEnum
CREATE TYPE "BillingLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "BillingReconciliationStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingReconciliationItemKind" AS ENUM ('PAYMENT_ATTEMPT', 'LEDGER_ENTRY', 'INVOICE');

-- CreateEnum
CREATE TYPE "BillingReconciliationItemStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'INVESTIGATING', 'RESOLVED');

-- AlterEnum
ALTER TYPE "RoleCode" ADD VALUE 'FINANCE_ADMIN';

-- CreateTable
CREATE TABLE "BillingAccount" (
    "id" UUID NOT NULL,
    "billingKey" TEXT NOT NULL,
    "type" "BillingAccountType" NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "companyInfo" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'NV',
    "preferences" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "tier" "BillingPlanTier" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlanVersion" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "BillingPlanVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "monthlyPriceMmk" INTEGER NOT NULL,
    "annualPriceMmk" INTEGER NOT NULL,
    "includedSeats" INTEGER NOT NULL DEFAULT 1,
    "maxSeats" INTEGER,
    "websitesLimit" INTEGER,
    "customDomainsLimit" INTEGER,
    "storageMb" INTEGER,
    "bandwidthMb" INTEGER,
    "monthlyAiCredits" INTEGER NOT NULL DEFAULT 0,
    "monthlyApiRequests" INTEGER,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "scopeType" "BillingScopeType" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "slotKey" TEXT,
    "planId" UUID NOT NULL,
    "planVersionId" UUID NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "priceMmk" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastRenewalKey" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscriptionItem" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "itemType" "BillingSubscriptionItemType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountMmk" INTEGER NOT NULL DEFAULT 0,
    "amountMmk" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSubscriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "accountId" UUID NOT NULL,
    "subscriptionId" UUID,
    "purpose" TEXT NOT NULL DEFAULT 'SUBSCRIPTION',
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "subtotalMmk" INTEGER NOT NULL DEFAULT 0,
    "discountMmk" INTEGER NOT NULL DEFAULT 0,
    "taxMmk" INTEGER NOT NULL DEFAULT 0,
    "totalMmk" INTEGER NOT NULL DEFAULT 0,
    "amountPaidMmk" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "lineType" "BillingInvoiceLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmountMmk" INTEGER NOT NULL,
    "amountMmk" INTEGER NOT NULL,
    "planVersionId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPaymentAttempt" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "method" "BillingPaymentMethod" NOT NULL,
    "amountMmk" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "transactionReference" TEXT NOT NULL,
    "proofStorageKey" TEXT,
    "proofMimeType" TEXT,
    "status" "BillingPaymentAttemptStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "verificationNote" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCreditPackage" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "priceMmk" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCreditPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCreditNote" (
    "id" UUID NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "invoiceId" UUID,
    "accountId" UUID NOT NULL,
    "type" "BillingCreditNoteType" NOT NULL DEFAULT 'REFUND',
    "status" "BillingCreditNoteStatus" NOT NULL DEFAULT 'REQUESTED',
    "amountMmk" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "reason" TEXT NOT NULL,
    "creditsReversed" INTEGER NOT NULL DEFAULT 0,
    "requestedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "issuedAt" TIMESTAMP(3),
    "payoutMethod" TEXT,
    "payoutReference" TEXT,
    "payoutConfirmedAt" TIMESTAMP(3),
    "payoutConfirmedById" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsageMeter" (
    "id" UUID NOT NULL,
    "code" "BillingUsageMeterCode" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingUsageMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsageEvent" (
    "id" UUID NOT NULL,
    "meterId" UUID NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "subjectType" "BillingUsageSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quality" "BillingUsageQuality" NOT NULL DEFAULT 'ESTIMATED',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingUsageAggregate" (
    "id" UUID NOT NULL,
    "meterId" UUID NOT NULL,
    "subjectType" "BillingUsageSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totalQuantity" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "isEstimated" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingUsageAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEntitlement" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'GLOBAL',
    "featureKey" TEXT NOT NULL,
    "valueInt" INTEGER,
    "valueBool" BOOLEAN,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sourceSubscriptionId" UUID,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingLedgerEntry" (
    "id" UUID NOT NULL,
    "entryType" "BillingLedgerEntryType" NOT NULL,
    "direction" "BillingLedgerDirection" NOT NULL,
    "amountMmk" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MMK',
    "accountId" UUID,
    "invoiceId" UUID,
    "paymentAttemptId" UUID,
    "creditNoteId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "memo" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "postedById" UUID,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReconciliation" (
    "id" UUID NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingReconciliationStatus" NOT NULL DEFAULT 'OPEN',
    "statementName" TEXT,
    "statementStorageKey" TEXT,
    "totalStatementAmountMmk" INTEGER,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "matchedAmountMmk" INTEGER NOT NULL DEFAULT 0,
    "unmatchedCount" INTEGER NOT NULL DEFAULT 0,
    "unmatchedAmountMmk" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "importedById" UUID NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingReconciliationItem" (
    "id" UUID NOT NULL,
    "reconciliationId" UUID NOT NULL,
    "kind" "BillingReconciliationItemKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMmk" INTEGER NOT NULL,
    "status" "BillingReconciliationItemStatus" NOT NULL DEFAULT 'UNMATCHED',
    "matchTargetType" TEXT,
    "matchTargetId" TEXT,
    "note" TEXT,
    "reviewedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingReconciliationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "accountId" UUID,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_billingKey_key" ON "BillingAccount"("billingKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_organizationId_key" ON "BillingAccount"("organizationId");

-- CreateIndex
CREATE INDEX "BillingAccount_ownerUserId_type_idx" ON "BillingAccount"("ownerUserId", "type");

-- CreateIndex
CREATE INDEX "BillingAccount_type_isActive_idx" ON "BillingAccount"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_code_key" ON "BillingPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_tier_key" ON "BillingPlan"("tier");

-- CreateIndex
CREATE INDEX "BillingPlanVersion_planId_status_idx" ON "BillingPlanVersion"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlanVersion_planId_version_key" ON "BillingPlanVersion"("planId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_slotKey_key" ON "BillingSubscription"("slotKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_idempotencyKey_key" ON "BillingSubscription"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingSubscription_accountId_status_idx" ON "BillingSubscription"("accountId", "status");

-- CreateIndex
CREATE INDEX "BillingSubscription_status_renewsAt_idx" ON "BillingSubscription"("status", "renewsAt");

-- CreateIndex
CREATE INDEX "BillingSubscription_scopeType_scopeKey_idx" ON "BillingSubscription"("scopeType", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_accountId_scopeType_scopeKey_idempotenc_key" ON "BillingSubscription"("accountId", "scopeType", "scopeKey", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscriptionItem_subscriptionId_itemType_key" ON "BillingSubscriptionItem"("subscriptionId", "itemType");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_invoiceNumber_key" ON "BillingInvoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_idempotencyKey_key" ON "BillingInvoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingInvoice_accountId_status_createdAt_idx" ON "BillingInvoice"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_status_dueAt_idx" ON "BillingInvoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_subscriptionId_createdAt_idx" ON "BillingInvoice"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoiceLine_invoiceId_idx" ON "BillingInvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAttempt_idempotencyKey_key" ON "BillingPaymentAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingPaymentAttempt_invoiceId_status_createdAt_idx" ON "BillingPaymentAttempt"("invoiceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPaymentAttempt_accountId_status_createdAt_idx" ON "BillingPaymentAttempt"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingPaymentAttempt_status_createdAt_idx" ON "BillingPaymentAttempt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPaymentAttempt_method_transactionReference_key" ON "BillingPaymentAttempt"("method", "transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCreditPackage_code_key" ON "BillingCreditPackage"("code");

-- CreateIndex
CREATE INDEX "BillingCreditPackage_isActive_sortOrder_idx" ON "BillingCreditPackage"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCreditNote_creditNoteNumber_key" ON "BillingCreditNote"("creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCreditNote_idempotencyKey_key" ON "BillingCreditNote"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingCreditNote_accountId_status_createdAt_idx" ON "BillingCreditNote"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingCreditNote_invoiceId_idx" ON "BillingCreditNote"("invoiceId");

-- CreateIndex
CREATE INDEX "BillingCreditNote_status_createdAt_idx" ON "BillingCreditNote"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingUsageMeter_code_key" ON "BillingUsageMeter"("code");

-- CreateIndex
CREATE INDEX "BillingUsageEvent_meterId_subjectType_subjectId_periodStart_idx" ON "BillingUsageEvent"("meterId", "subjectType", "subjectId", "periodStart");

-- CreateIndex
CREATE INDEX "BillingUsageEvent_subjectType_subjectId_occurredAt_idx" ON "BillingUsageEvent"("subjectType", "subjectId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingUsageEvent_meterId_sourceEventId_key" ON "BillingUsageEvent"("meterId", "sourceEventId");

-- CreateIndex
CREATE INDEX "BillingUsageAggregate_subjectType_subjectId_periodStart_idx" ON "BillingUsageAggregate"("subjectType", "subjectId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "BillingUsageAggregate_meterId_subjectType_subjectId_periodS_key" ON "BillingUsageAggregate"("meterId", "subjectType", "subjectId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "BillingEntitlement_accountId_enabled_idx" ON "BillingEntitlement"("accountId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEntitlement_accountId_scopeKey_featureKey_key" ON "BillingEntitlement"("accountId", "scopeKey", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingLedgerEntry_idempotencyKey_key" ON "BillingLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_entryType_postedAt_idx" ON "BillingLedgerEntry"("entryType", "postedAt");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_accountId_postedAt_idx" ON "BillingLedgerEntry"("accountId", "postedAt");

-- CreateIndex
CREATE INDEX "BillingLedgerEntry_sourceType_sourceId_idx" ON "BillingLedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReconciliation_reportNumber_key" ON "BillingReconciliation"("reportNumber");

-- CreateIndex
CREATE INDEX "BillingReconciliation_status_openedAt_idx" ON "BillingReconciliation"("status", "openedAt");

-- CreateIndex
CREATE INDEX "BillingReconciliationItem_reconciliationId_status_idx" ON "BillingReconciliationItem"("reconciliationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingReconciliationItem_reconciliationId_kind_reference_key" ON "BillingReconciliationItem"("reconciliationId", "kind", "reference");

-- CreateIndex
CREATE INDEX "BillingAuditLog_entityType_entityId_idx" ON "BillingAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "BillingAuditLog_accountId_createdAt_idx" ON "BillingAuditLog"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingAuditLog_actorId_createdAt_idx" ON "BillingAuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPlanVersion" ADD CONSTRAINT "BillingPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "BillingPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingSubscriptionItem" ADD CONSTRAINT "BillingSubscriptionItem_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoiceLine" ADD CONSTRAINT "BillingInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoiceLine" ADD CONSTRAINT "BillingInvoiceLine_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "BillingPlanVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttempt" ADD CONSTRAINT "BillingPaymentAttempt_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttempt" ADD CONSTRAINT "BillingPaymentAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttempt" ADD CONSTRAINT "BillingPaymentAttempt_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingPaymentAttempt" ADD CONSTRAINT "BillingPaymentAttempt_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingCreditNote" ADD CONSTRAINT "BillingCreditNote_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingUsageEvent" ADD CONSTRAINT "BillingUsageEvent_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "BillingUsageMeter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEntitlement" ADD CONSTRAINT "BillingEntitlement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEntitlement" ADD CONSTRAINT "BillingEntitlement_sourceSubscriptionId_fkey" FOREIGN KEY ("sourceSubscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BillingAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "BillingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingLedgerEntry" ADD CONSTRAINT "BillingLedgerEntry_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReconciliation" ADD CONSTRAINT "BillingReconciliation_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReconciliation" ADD CONSTRAINT "BillingReconciliation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReconciliationItem" ADD CONSTRAINT "BillingReconciliationItem_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BillingReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingReconciliationItem" ADD CONSTRAINT "BillingReconciliationItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAuditLog" ADD CONSTRAINT "BillingAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

