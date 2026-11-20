-- Rebuild the enum so this migration also works on PostgreSQL versions that
-- cannot use a newly-added enum value in the same transaction.
ALTER TYPE "PaymentSubmissionStatus" RENAME TO "PaymentSubmissionStatus_old";
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED', 'NEEDS_RESUBMISSION');
ALTER TABLE "PaymentSubmission" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PaymentSubmission" ALTER COLUMN "status" TYPE "PaymentSubmissionStatus" USING "status"::text::"PaymentSubmissionStatus";
ALTER TABLE "PaymentSubmission" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"PaymentSubmissionStatus";
ALTER TABLE "PaymentReview" ALTER COLUMN "decision" TYPE "PaymentSubmissionStatus" USING "decision"::text::"PaymentSubmissionStatus";
DROP TYPE "PaymentSubmissionStatus_old";

ALTER TABLE "PaymentSubmission"
  ADD COLUMN "transferDate" TIMESTAMP(3),
  ADD COLUMN "senderName" TEXT,
  ADD COLUMN "senderAccountIdentifier" TEXT,
  ADD COLUMN "customerNotes" TEXT,
  ADD COLUMN "proofFileSize" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "PaymentReviewEvent" (
  "id" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "previousStatus" "PaymentSubmissionStatus",
  "nextStatus" "PaymentSubmissionStatus" NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentReviewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentReviewEvent_submissionId_createdAt_idx" ON "PaymentReviewEvent"("submissionId", "createdAt");
CREATE INDEX "PaymentReviewEvent_actorId_createdAt_idx" ON "PaymentReviewEvent"("actorId", "createdAt");
ALTER TABLE "PaymentReviewEvent" ADD CONSTRAINT "PaymentReviewEvent_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "PaymentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReviewEvent" ADD CONSTRAINT "PaymentReviewEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
