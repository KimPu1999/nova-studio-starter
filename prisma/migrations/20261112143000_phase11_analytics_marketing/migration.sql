-- Phase 11: consent-aware analytics and approval-gated marketing campaigns.
CREATE TYPE "MarketingCampaignStatus" AS ENUM ('DRAFT','SCHEDULED','ACTIVE','PAUSED','COMPLETED','CANCELLED');

CREATE TABLE "AnalyticsEvent" (
  "id" UUID NOT NULL,
  "eventName" TEXT NOT NULL,
  "userId" UUID,
  "anonymousId" TEXT,
  "sessionId" TEXT,
  "path" TEXT,
  "payload" JSONB,
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AnalyticsEvent_idempotencyKey_key" ON "AnalyticsEvent"("idempotencyKey");
CREATE INDEX "AnalyticsEvent_eventName_occurredAt_idx" ON "AnalyticsEvent"("eventName","occurredAt");
CREATE INDEX "AnalyticsEvent_userId_occurredAt_idx" ON "AnalyticsEvent"("userId","occurredAt");
CREATE INDEX "AnalyticsEvent_anonymousId_occurredAt_idx" ON "AnalyticsEvent"("anonymousId","occurredAt");

CREATE TABLE "MarketingConsent" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "marketingEmail" BOOLEAN NOT NULL DEFAULT false,
  "source" TEXT,
  "consentedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingConsent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MarketingConsent_userId_key" ON "MarketingConsent"("userId");
CREATE INDEX "MarketingConsent_marketingEmail_updatedAt_idx" ON "MarketingConsent"("marketingEmail","updatedAt");

CREATE TABLE "MarketingCampaign" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "audience" JSONB,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "budgetMmk" INTEGER,
  "status" "MarketingCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MarketingCampaign_status_startsAt_endsAt_idx" ON "MarketingCampaign"("status","startsAt","endsAt");
CREATE INDEX "MarketingCampaign_createdById_createdAt_idx" ON "MarketingCampaign"("createdById","createdAt");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MarketingConsent" ADD CONSTRAINT "MarketingConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
