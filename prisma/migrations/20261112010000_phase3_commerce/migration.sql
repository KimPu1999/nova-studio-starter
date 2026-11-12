-- Phase 3: commerce, manual payments, and secure delivery.
ALTER TYPE "RoleCode" ADD VALUE IF NOT EXISTS 'CUSTOMER';

CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_REVIEW', 'PAID', 'CANCELLED', 'REFUNDED');
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "Template" ADD COLUMN "sourceFileStorageKey" TEXT;
ALTER TABLE "Template" ADD COLUMN "sourceFileName" TEXT;
ALTER TABLE "Template" ADD COLUMN "sourceFileSize" INTEGER;

CREATE TABLE "Cart" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CartItem" (
  "id" UUID NOT NULL,
  "cartId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" UUID NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "subtotalMmk" INTEGER NOT NULL,
  "totalMmk" INTEGER NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerEmail" TEXT NOT NULL,
  "customerPhone" TEXT NOT NULL,
  "orderNotes" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "OrderItem" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "templateId" UUID,
  "templateName" TEXT NOT NULL,
  "templateSlug" TEXT NOT NULL,
  "unitPriceMmk" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentMethod" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "accountHolderName" TEXT NOT NULL,
  "walletNumber" TEXT NOT NULL,
  "qrStorageKey" TEXT,
  "instructions" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentSubmission" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "paymentMethodId" UUID NOT NULL,
  "submittedById" UUID NOT NULL,
  "amountMmk" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'MMK',
  "transactionReference" TEXT NOT NULL,
  "proofStorageKey" TEXT NOT NULL,
  "proofMimeType" TEXT NOT NULL,
  "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentSubmission_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PaymentReview" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "reviewerId" UUID NOT NULL,
  "decision" "PaymentSubmissionStatus" NOT NULL,
  "rejectionReason" TEXT,
  "verifiedNote" TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DownloadEntitlement" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "maxDownloads" INTEGER NOT NULL DEFAULT 5,
  "downloadCount" INTEGER NOT NULL DEFAULT 0,
  "tokenVersion" INTEGER NOT NULL DEFAULT 1,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DownloadEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DownloadEvent" (
  "id" UUID NOT NULL,
  "entitlementId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DownloadEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Cart_userId_key" ON "Cart"("userId");
CREATE UNIQUE INDEX "CartItem_cartId_templateId_key" ON "CartItem"("cartId", "templateId");
CREATE INDEX "CartItem_templateId_idx" ON "CartItem"("templateId");
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE UNIQUE INDEX "OrderItem_orderId_templateSlug_key" ON "OrderItem"("orderId", "templateSlug");
CREATE INDEX "OrderItem_templateId_idx" ON "OrderItem"("templateId");
CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");
CREATE INDEX "PaymentMethod_isEnabled_displayOrder_idx" ON "PaymentMethod"("isEnabled", "displayOrder");
CREATE UNIQUE INDEX "PaymentSubmission_idempotencyKey_key" ON "PaymentSubmission"("idempotencyKey");
CREATE INDEX "PaymentSubmission_orderId_status_createdAt_idx" ON "PaymentSubmission"("orderId", "status", "createdAt");
CREATE INDEX "PaymentSubmission_submittedById_createdAt_idx" ON "PaymentSubmission"("submittedById", "createdAt");
CREATE UNIQUE INDEX "PaymentReview_submissionId_key" ON "PaymentReview"("submissionId");
CREATE INDEX "PaymentReview_reviewerId_reviewedAt_idx" ON "PaymentReview"("reviewerId", "reviewedAt");
CREATE UNIQUE INDEX "DownloadEntitlement_orderId_templateId_key" ON "DownloadEntitlement"("orderId", "templateId");
CREATE UNIQUE INDEX "DownloadEntitlement_orderId_templateId_userId_key" ON "DownloadEntitlement"("orderId", "templateId", "userId");
CREATE INDEX "DownloadEntitlement_userId_revokedAt_idx" ON "DownloadEntitlement"("userId", "revokedAt");
CREATE INDEX "DownloadEvent_entitlementId_createdAt_idx" ON "DownloadEvent"("entitlementId", "createdAt");
CREATE INDEX "DownloadEvent_userId_createdAt_idx" ON "DownloadEvent"("userId", "createdAt");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentSubmission" ADD CONSTRAINT "PaymentSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PaymentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReview" ADD CONSTRAINT "PaymentReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DownloadEntitlement" ADD CONSTRAINT "DownloadEntitlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DownloadEntitlement" ADD CONSTRAINT "DownloadEntitlement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DownloadEntitlement" ADD CONSTRAINT "DownloadEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "DownloadEntitlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DownloadEvent" ADD CONSTRAINT "DownloadEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
