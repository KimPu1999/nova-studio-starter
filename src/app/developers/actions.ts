'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser, currentUser, csrfCheck } from '@/lib/auth';
import { encryptSecret, generateCredential, hashCredential } from '@/lib/security/secrets';
import { apiScopes, sandboxScopes } from '@/lib/api-v1';
import { hasWorkspacePermission } from '@/lib/workspaces';
import { WorkspaceMemberRole } from '@prisma/client';
import { checkWebhookUrl } from '@/lib/webhooks/safe-fetch';
import { enqueueWebhookEvent, webhookEventTypes, triggerDeliveryKick, WEBHOOK_EVENT_VERSION, WebhookEventType } from '@/lib/webhooks/events';
import { retryDelivery } from '@/lib/webhooks/events';
import { clampScopes, newClientCredentials } from '@/lib/api/oauth';
import { prismaAudit } from '@/lib/api/audit';

export type CreationResult = { ok: boolean; error?: string; secretOnce?: string; id?: string };

const text = (formData: FormData, key: string) => String(formData.get(key) || '');
const EXPIRY_CHOICES: Record<string, number | null> = { '30': 30, '90': 90, '365': 365, never: null };

/** Creates a personal or workspace-scoped API key. The plaintext key is returned once. */
export async function createApiKeyAction(formData: FormData): Promise<CreationResult> {
  const user = await requireUser();
  await csrfCheck();
  const name = text(formData, 'name').trim().slice(0, 80);
  const workspaceId = text(formData, 'workspaceId') || null;
  const expiry = EXPIRY_CHOICES[text(formData, 'expiresIn') || 'never'] ?? null;
  const requestedScopes = formData.getAll('scopes').map(String).filter((s) => (apiScopes as readonly string[]).includes(s));
  if (!name || requestedScopes.length === 0) return { ok: false, error: 'A name and at least one scope are required.' };

  if (workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspaceId } });
    if (!membership || !hasWorkspacePermission(membership.role as WorkspaceMemberRole, 'projects.read')) {
      return { ok: false, error: 'You cannot create workspace keys for this workspace.' };
    }
  }

  // Least privilege: workspace keys can never exceed the creator's abilities.
  const key = generateCredential('nova_sk');
  const credential = await prisma.apiCredential.create({
    data: {
      userId: user.id,
      workspaceId,
      name,
      keyPrefix: key.slice(0, 12),
      keyHash: hashCredential(key),
      scopes: requestedScopes,
      expiresAt: expiry ? new Date(Date.now() + expiry * 24 * 3600_000) : null,
    },
    select: { id: true },
  });
  await prismaAudit({ userId: user.id, workspaceId, action: 'apikey.create', metadata: { credentialId: credential.id, scopes: requestedScopes, workspaceId } });
  revalidatePath('/developers/api-keys');
  return { ok: true, secretOnce: key, id: credential.id };
}

export async function revokeApiKeyAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const credential = await prisma.apiCredential.findFirst({ where: { id, userId: user.id, revokedAt: null } });
  if (!credential) return;
  await prisma.apiCredential.update({ where: { id }, data: { revokedAt: new Date() } });
  await prismaAudit({ userId: user.id, workspaceId: credential.workspaceId, action: 'apikey.revoke', metadata: { credentialId: id } });
  revalidatePath('/developers/api-keys');
}

/** Registers an OAuth application. Confidential clients receive a secret shown once. */
export async function createOAuthAppAction(formData: FormData): Promise<CreationResult> {
  const user = await requireUser();
  await csrfCheck();
  const name = text(formData, 'name').trim().slice(0, 80);
  const description = text(formData, 'description').trim().slice(0, 300) || null;
  const redirectUris = text(formData, 'redirectUris').split(/\s+/).map((u) => u.trim()).filter(Boolean);
  const clientType = text(formData, 'clientType') === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'PUBLIC';
  const requestedScopes = clampScopes(formData.getAll('scopes').map(String), [...apiScopes]);
  if (!name || redirectUris.length === 0 || requestedScopes.length === 0) return { ok: false, error: 'Name, at least one HTTPS redirect URI and one scope are required.' };
  if (redirectUris.some((uri) => { try { return new URL(uri).protocol !== 'https:'; } catch { return true; } })) {
    return { ok: false, error: 'Redirect URIs must be valid HTTPS URLs.' };
  }
  const workspaceId = text(formData, 'workspaceId') || null;
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspaceId } });
    if (!membership) return { ok: false, error: 'Invalid workspace.' };
  }

  const { clientId, clientSecret } = newClientCredentials();
  const application = await prisma.developerApplication.create({
    data: {
      userId: user.id,
      workspaceId,
      name,
      description,
      clients: {
        create: {
          clientId,
          secretHash: clientType === 'CONFIDENTIAL' ? hashCredential(clientSecret) : null,
          redirectUris,
          scopes: requestedScopes,
          clientType,
        },
      },
    },
    include: { clients: { select: { id: true } } },
  });
  await prismaAudit({ userId: user.id, workspaceId, action: 'oauthapp.create', metadata: { applicationId: application.id, clientType, scopes: requestedScopes } });
  revalidatePath('/developers/apps');
  return { ok: true, id: application.id, secretOnce: clientType === 'CONFIDENTIAL' ? `${clientId} · ${clientSecret}` : clientId };
}

export async function revokeOAuthAppAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const app = await prisma.developerApplication.findFirst({ where: { id, userId: user.id } });
  if (!app) return;
  await prisma.$transaction([
    prisma.developerApplication.update({ where: { id }, data: { status: 'REVOKED' } }),
    prisma.oAuthClient.updateMany({ where: { applicationId: id }, data: { status: 'REVOKED' } }),
    prisma.oAuthTokenRecord.updateMany({ where: { client: { applicationId: id }, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.oAuthAuthorization.deleteMany({ where: { client: { applicationId: id }, consumedAt: null } }),
  ]);
  await prismaAudit({ userId: user.id, action: 'oauthapp.revoke', metadata: { applicationId: id } });
  revalidatePath('/developers/apps');
}

export async function createWebhookEndpointAction(formData: FormData): Promise<CreationResult> {
  const user = await requireUser();
  await csrfCheck();
  const workspaceId = text(formData, 'workspaceId');
  const url = text(formData, 'url').trim();
  const events = formData.getAll('events').map(String).filter((e) => (webhookEventTypes as readonly string[]).includes(e));
  if (!workspaceId || !url || events.length === 0) return { ok: false, error: 'Workspace, HTTPS URL and at least one event are required.' };
  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspaceId } });
  if (!membership || !hasWorkspacePermission(membership.role as WorkspaceMemberRole, 'workspace.update')) {
    return { ok: false, error: 'You cannot manage webhooks in this workspace.' };
  }
  const urlCheck = checkWebhookUrl(url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.reason || 'Endpoint URL rejected.' };

  const secret = `whsec_${crypto.randomBytes(32).toString('base64url')}`;
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      workspaceId,
      url,
      secrets: { create: { secretCiphertext: encryptSecret(secret), version: 1 } },
      subscriptions: { create: events.map((eventType) => ({ eventType, version: WEBHOOK_EVENT_VERSION, isActive: true })) },
    },
    select: { id: true },
  });
  await prismaAudit({ userId: user.id, workspaceId, action: 'webhook.endpoint.create', metadata: { webhookEndpointId: endpoint.id, events } });
  revalidatePath('/developers/webhooks');
  return { ok: true, id: endpoint.id, secretOnce: secret };
}

export async function rotateWebhookSecretAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, workspace: { members: { some: { userId: user.id } } } } });
  if (!endpoint) return;
  // Portal rotation is confirmed on the endpoint page; the new secret is shown once there.
  redirect(`/developers/webhooks/${id}?rotate=1`);
}

export async function disableWebhookEndpointAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id, workspace: { members: { some: { userId: user.id } } } } });
  if (!endpoint) return;
  await prisma.webhookEndpoint.update({ where: { id }, data: { status: 'DISABLED' } });
  await prismaAudit({ userId: user.id, workspaceId: endpoint.workspaceId, action: 'webhook.endpoint.disable', metadata: { webhookEndpointId: id } });
  revalidatePath('/developers/webhooks');
}

export async function retryDeliveryAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const delivery = await prisma.webhookDelivery.findFirst({ where: { id, event: { workspace: { members: { some: { userId: user.id } } } } }, include: { event: { select: { workspaceId: true } } } });
  if (!delivery) return;
  await retryDelivery(id, delivery.event.workspaceId!);
  triggerDeliveryKick();
  revalidatePath('/developers/webhooks');
}

/** Creates a sandbox with its own isolated credential. Key shown once. */
export async function createSandboxAction(formData: FormData): Promise<CreationResult> {
  const user = await requireUser();
  await csrfCheck();
  const name = text(formData, 'name').trim().slice(0, 80) || 'Sandbox';
  const workspaceId = text(formData, 'workspaceId') || null;
  if (workspaceId) {
    const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id, workspaceId } });
    if (!membership) return { ok: false, error: 'Invalid workspace.' };
  }
  const key = generateCredential('nova_sb');
  const sandbox = await prisma.developerSandbox.create({
    data: { userId: user.id, workspaceId, name, keyPrefix: key.slice(0, 12), keyHash: hashCredential(key), quota: Number(process.env.API_SANDBOX_MONTHLY_QUOTA || 2_000) },
    select: { id: true },
  });
  await prismaAudit({ userId: user.id, workspaceId, action: 'sandbox.create', metadata: { sandboxId: sandbox.id } });
  revalidatePath('/developers/sandbox');
  return { ok: true, id: sandbox.id, secretOnce: key };
}

export async function disableSandboxAction(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const id = text(formData, 'id');
  const sandbox = await prisma.developerSandbox.findFirst({ where: { id, userId: user.id } });
  if (!sandbox) return;
  await prisma.developerSandbox.update({ where: { id }, data: { status: 'DISABLED' } });
  await prismaAudit({ userId: user.id, action: 'sandbox.disable', metadata: { sandboxId: id } });
  revalidatePath('/developers/sandbox');
}

/** Simulates a sandbox event from the portal (clearly labelled as simulated). */
export async function simulateSandboxEventAction(formData: FormData): Promise<CreationResult> {
  const user = await requireUser();
  await csrfCheck();
  const sandboxId = text(formData, 'sandboxId');
  const sandbox = await prisma.developerSandbox.findFirst({ where: { id: sandboxId, userId: user.id, status: 'ACTIVE' } });
  if (!sandbox) return { ok: false, error: 'Sandbox not found.' };
  if (!sandbox.workspaceId) return { ok: false, error: 'Link this sandbox to a workspace to simulate deliveries.' };
  const eventType = text(formData, 'eventType');
  if (!(webhookEventTypes as readonly string[]).includes(eventType)) return { ok: false, error: 'Unsupported event type.' };
  const result = await enqueueWebhookEvent(sandbox.workspaceId, eventType as WebhookEventType, { sandboxId: sandbox.id, simulatedBy: user.id }, { environment: 'SANDBOX', simulate: true });
  await prismaAudit({ userId: user.id, workspaceId: sandbox.workspaceId, action: 'sandbox.event.simulate', metadata: { eventId: result.eventId, eventType } });
  if (result.deliveryCount > 0) triggerDeliveryKick();
  revalidatePath('/developers/sandbox');
  return { ok: true, id: result.eventId, secretOnce: `${result.eventId} (${result.deliveryCount} delivery target${result.deliveryCount === 1 ? '' : 's'})` };
}

/** Void-returning wrapper so the sandbox page can post a plain form. */
export async function simulateSandboxEventFormAction(formData: FormData) {
  await simulateSandboxEventAction(formData);
}

export async function disconnectIntegrationAction(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect('/login');
  await csrfCheck();
  const id = text(formData, 'id');
  // OAuth app connections: revoke every active token for this client + user.
  const token = await prisma.oAuthTokenRecord.findFirst({ where: { id, userId: user.id, revokedAt: null }, select: { clientId: true, workspaceId: true } });
  if (token) {
    await prisma.oAuthTokenRecord.updateMany({ where: { clientId: token.clientId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.oAuthAuthorization.deleteMany({ where: { clientId: token.clientId, userId: user.id, consumedAt: null } });
    await prismaAudit({ userId: user.id, workspaceId: token.workspaceId, action: 'integration.disconnect', metadata: { clientId: token.clientId } });
    revalidatePath('/developers/integrations');
    return;
  }
  const connection = await prisma.integrationConnection.findFirst({ where: { id, userId: user.id, revokedAt: null } });
  if (!connection) return;
  await prisma.integrationConnection.update({ where: { id }, data: { status: 'REVOKED', revokedAt: new Date(), encryptedToken: encryptSecret('revoked') } });
  await prismaAudit({ userId: user.id, workspaceId: connection.workspaceId, action: 'integration.disconnect', metadata: { connectionId: id, provider: connection.provider } });
  revalidatePath('/developers/integrations');
}

