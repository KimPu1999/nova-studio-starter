'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser, csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { websiteSchema } from '@/lib/ai/schema';

const reservedSlugs = new Set(['admin', 'api', 'account', 'checkout', 'hosting', 'login', 'register', 'www', 'support']);

export async function createHostedWebsite(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrfCheck();
  const projectId = String(formData.get('projectId') || '');
  const name = String(formData.get('name') || '').trim().slice(0, 120);
  const slug = String(formData.get('slug') || '').trim().toLowerCase();
  if (!projectId || !name || !/^[a-z0-9-]{3,50}$/.test(slug) || reservedSlugs.has(slug)) return;
  const project = await prisma.aiWebsiteProject.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true, schema: true } });
  if (!project || !websiteSchema.safeParse(project.schema).success) return;
  const site = await prisma.hostedWebsite.create({ data: { userId: user.id, projectId, name, slug } });
  revalidatePath('/hosting');
  redirect(`/hosting/sites/${site.id}`);
}

export async function queueDeployment(formData: FormData) {
  const user = await requireUser();
  await csrfCheck();
  const websiteId = String(formData.get('websiteId') || '');
  const idempotencyKey = String(formData.get('idempotencyKey') || crypto.randomUUID());
  const site = await prisma.hostedWebsite.findFirst({ where: { id: websiteId, userId: user.id, deletedAt: null }, include: { project: true } });
  if (!site) return;
  const parsed = websiteSchema.safeParse(site.project.schema);
  if (!parsed.success) return;
  const latest = await prisma.aiWebsiteRevision.findFirst({ where: { projectId: site.projectId }, orderBy: { version: 'desc' } });
  if (!latest) return;
  await prisma.$transaction(async (tx) => {
    const existing = await tx.websiteDeployment.findUnique({ where: { idempotencyKey } });
    if (existing) return;
    const last = await tx.websiteDeployment.findFirst({ where: { websiteId }, orderBy: { number: 'desc' }, select: { number: true } });
    await tx.websiteDeployment.create({ data: { websiteId, revisionId: latest.id, number: (last?.number ?? 0) + 1, status: 'QUEUED', snapshot: parsed.data, idempotencyKey, logs: { create: { level: 'INFO', message: 'Queued for publication. A durable worker is required to build and activate this deployment.' } } } });
    await tx.hostedWebsite.update({ where: { id: websiteId }, data: { status: 'QUEUED' } });
  });
  revalidatePath(`/hosting/sites/${websiteId}`);
}
