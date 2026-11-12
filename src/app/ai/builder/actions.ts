'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser, csrfCheck } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { websiteBuilderInput, websiteSchema, emptyWebsiteDefinition } from '@/lib/ai/schema';

export async function createAiWebsiteProject(formData: FormData): Promise<void> {
  const user = await requireUser();
  await csrfCheck();
  const parsed = websiteBuilderInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const definition = emptyWebsiteDefinition(parsed.data);
  const project = await prisma.aiWebsiteProject.create({
    data: {
      userId: user.id,
      name: parsed.data.name,
      description: parsed.data.description,
      schema: definition,
      revisions: { create: { version: 1, schema: definition, createdById: user.id } },
    },
  });
  revalidatePath('/ai/builder');
  redirect(`/ai/builder/${project.id}`);
}

export async function saveAiWebsiteProject(projectId: string, rawSchema: unknown) {
  const user = await requireUser();
  await csrfCheck();
  const parsed = websiteSchema.safeParse(rawSchema);
  if (!parsed.success) return { ok: false, error: 'The website definition is invalid.' };
  const project = await prisma.aiWebsiteProject.findFirst({ where: { id: projectId, userId: user.id }, select: { id: true, schemaVersion: true } });
  if (!project) return { ok: false, error: 'Project not found.' };
  await prisma.$transaction(async (tx) => {
    const latest = await tx.aiWebsiteRevision.findFirst({ where: { projectId }, orderBy: { version: 'desc' }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    await tx.aiWebsiteProject.update({ where: { id: project.id }, data: { schema: parsed.data, schemaVersion: parsed.data.version } });
    await tx.aiWebsiteRevision.create({ data: { projectId: project.id, version, schema: parsed.data, createdById: user.id } });
  });
  revalidatePath(`/ai/builder/${projectId}`);
  return { ok: true };
}
