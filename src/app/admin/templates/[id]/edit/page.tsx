import Link from 'next/link';
import {notFound} from 'next/navigation';
import {RoleCode} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {TemplateCmsForm} from '../../cms-form';
import {TemplatePdfManager} from '../../pdf-manager';

export const dynamic='force-dynamic';

export default async function EditTemplate({params}:{params:Promise<{id:string}>}){
  await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
  const {id}=await params;
  const [template,categories]=await Promise.all([
    prisma.template.findUnique({where:{id},include:{detail:true,features:{orderBy:{sortOrder:'asc'}},screenshots:{orderBy:{sortOrder:'asc'}},documentation:{include:{sections:{orderBy:{sortOrder:'asc'}}}},designSettings:true,pdfFiles:{orderBy:{sortOrder:'asc'}}}}),
    prisma.category.findMany({orderBy:{name:'asc'}})
  ]);
  if(!template)notFound();
  return <main className="admin-content"><Link href="/admin/templates" className="text-sm text-slate-400">← Templates</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">TEMPLATE CMS</p><h1 className="admin-title">{template.name}</h1><p className="mt-2 text-sm text-slate-400">Manage project details, documentation, PDFs, design, and access.</p></div><span className={`status-badge status-${template.status.toLowerCase()}`}>{template.status}</span></div><div className="mt-8"><TemplateCmsForm template={template} categories={categories}/></div><TemplatePdfManager templateId={template.id} templateSlug={template.slug} pdfs={template.pdfFiles}/></main>;
}
