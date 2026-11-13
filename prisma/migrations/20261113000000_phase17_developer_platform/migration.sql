-- Phase 17: Public API, developer platform and third-party integrations

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'RETRYING', 'FAILED', 'DEAD_LETTER');


-- CreateTable
CREATE TABLE "DeveloperApplication" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthClient" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "secretHash" TEXT,
    "redirectUris" TEXT[],
    "scopes" TEXT[],
    "clientType" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorization" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scope" TEXT[],
    "codeHash" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "challengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthTokenRecord" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT,
    "scope" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthTokenRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsageEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "credentialId" UUID,
    "requestId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "rateLimited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiQuotaPolicy" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "requestsPerMinute" INTEGER NOT NULL,
    "monthlyRequests" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiQuotaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '2026-11-12',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "workspaceId" UUID,
    "eventType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSigningSecret" (
    "id" UUID NOT NULL,
    "endpointId" UUID NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookSigningSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "provider" TEXT NOT NULL,
    "encryptedToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeveloperSandbox" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "workspaceId" UUID,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 1000,
    "used" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperSandbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "workspaceId" UUID,
    "action" TEXT NOT NULL,
    "endpoint" TEXT,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiRateCounter" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiRateCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDeliveryAttempt" (
    "id" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "errorKind" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiIdempotencyRecord" (
    "id" UUID NOT NULL,
    "principalKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiIdempotencyRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeveloperApplication_userId_status_createdAt_idx" ON "DeveloperApplication"("userId", "status", "createdAt");
CREATE INDEX "DeveloperApplication_workspaceId_status_createdAt_idx" ON "DeveloperApplication"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "OAuthClient_clientId_key" ON "OAuthClient"("clientId");
CREATE INDEX "OAuthClient_applicationId_status_idx" ON "OAuthClient"("applicationId", "status");
CREATE UNIQUE INDEX "OAuthAuthorization_codeHash_key" ON "OAuthAuthorization"("codeHash");
CREATE INDEX "OAuthAuthorization_clientId_expiresAt_consumedAt_idx" ON "OAuthAuthorization"("clientId", "expiresAt", "consumedAt");
CREATE UNIQUE INDEX "OAuthTokenRecord_accessTokenHash_key" ON "OAuthTokenRecord"("accessTokenHash");
CREATE UNIQUE INDEX "OAuthTokenRecord_refreshTokenHash_key" ON "OAuthTokenRecord"("refreshTokenHash");
CREATE INDEX "OAuthTokenRecord_userId_revokedAt_expiresAt_idx" ON "OAuthTokenRecord"("userId", "revokedAt", "expiresAt");
CREATE INDEX "OAuthTokenRecord_workspaceId_revokedAt_expiresAt_idx" ON "OAuthTokenRecord"("workspaceId", "revokedAt", "expiresAt");
CREATE UNIQUE INDEX "ApiUsageEvent_requestId_key" ON "ApiUsageEvent"("requestId");
CREATE INDEX "ApiUsageEvent_workspaceId_createdAt_idx" ON "ApiUsageEvent"("workspaceId", "createdAt");
CREATE INDEX "ApiUsageEvent_credentialId_createdAt_idx" ON "ApiUsageEvent"("credentialId", "createdAt");
CREATE INDEX "ApiUsageEvent_endpoint_statusCode_createdAt_idx" ON "ApiUsageEvent"("endpoint", "statusCode", "createdAt");
CREATE UNIQUE INDEX "ApiQuotaPolicy_workspaceId_key" ON "ApiQuotaPolicy"("workspaceId");
CREATE INDEX "WebhookEndpoint_workspaceId_status_createdAt_idx" ON "WebhookEndpoint"("workspaceId", "status", "createdAt");
CREATE UNIQUE INDEX "WebhookSubscription_endpointId_eventType_version_key" ON "WebhookSubscription"("endpointId", "eventType", "version");
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");
CREATE INDEX "WebhookEvent_workspaceId_eventType_createdAt_idx" ON "WebhookEvent"("workspaceId", "eventType", "createdAt");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "WebhookDelivery"("endpointId", "createdAt");
CREATE UNIQUE INDEX "WebhookDelivery_eventId_endpointId_key" ON "WebhookDelivery"("eventId", "endpointId");
CREATE INDEX "WebhookSigningSecret_endpointId_revokedAt_createdAt_idx" ON "WebhookSigningSecret"("endpointId", "revokedAt", "createdAt");
CREATE INDEX "IntegrationConnection_userId_provider_status_idx" ON "IntegrationConnection"("userId", "provider", "status");
CREATE INDEX "IntegrationConnection_workspaceId_provider_status_idx" ON "IntegrationConnection"("workspaceId", "provider", "status");
CREATE UNIQUE INDEX "DeveloperSandbox_keyHash_key" ON "DeveloperSandbox"("keyHash");
CREATE INDEX "DeveloperSandbox_userId_status_idx" ON "DeveloperSandbox"("userId", "status");
CREATE INDEX "DeveloperSandbox_workspaceId_status_idx" ON "DeveloperSandbox"("workspaceId", "status");
CREATE INDEX "ApiAuditLog_workspaceId_createdAt_idx" ON "ApiAuditLog"("workspaceId", "createdAt");
CREATE INDEX "ApiAuditLog_action_createdAt_idx" ON "ApiAuditLog"("action", "createdAt");
CREATE INDEX "ApiRateCounter_windowStart_idx" ON "ApiRateCounter"("windowStart");
CREATE UNIQUE INDEX "ApiRateCounter_scope_key_windowStart_key" ON "ApiRateCounter"("scope", "key", "windowStart");
CREATE INDEX "WebhookDeliveryAttempt_deliveryId_createdAt_idx" ON "WebhookDeliveryAttempt"("deliveryId", "createdAt");
CREATE UNIQUE INDEX "WebhookDeliveryAttempt_deliveryId_attemptNumber_key" ON "WebhookDeliveryAttempt"("deliveryId", "attemptNumber");
CREATE INDEX "ApiIdempotencyRecord_expiresAt_idx" ON "ApiIdempotencyRecord"("expiresAt");
CREATE UNIQUE INDEX "ApiIdempotencyRecord_principalKey_operation_idempotencyKey_key" ON "ApiIdempotencyRecord"("principalKey", "operation", "idempotencyKey");
ALTER TABLE "DeveloperApplication" ADD CONSTRAINT "DeveloperApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperApplication" ADD CONSTRAINT "DeveloperApplication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "DeveloperApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAuthorization" ADD CONSTRAINT "OAuthAuthorization_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAuthorization" ADD CONSTRAINT "OAuthAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthTokenRecord" ADD CONSTRAINT "OAuthTokenRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthTokenRecord" ADD CONSTRAINT "OAuthTokenRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthTokenRecord" ADD CONSTRAINT "OAuthTokenRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiUsageEvent" ADD CONSTRAINT "ApiUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiUsageEvent" ADD CONSTRAINT "ApiUsageEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiQuotaPolicy" ADD CONSTRAINT "ApiQuotaPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookSigningSecret" ADD CONSTRAINT "WebhookSigningSecret_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperSandbox" ADD CONSTRAINT "DeveloperSandbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeveloperSandbox" ADD CONSTRAINT "DeveloperSandbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApiAuditLog" ADD CONSTRAINT "ApiAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApiAuditLog" ADD CONSTRAINT "ApiAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WebhookDeliveryAttempt" ADD CONSTRAINT "WebhookDeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "WebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
