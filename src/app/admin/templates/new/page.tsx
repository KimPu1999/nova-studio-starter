import {RoleCode} from '@prisma/client';
import {requireAdmin} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {TemplateCmsForm} from '../cms-form';

export const dynamic='force-dynamic';

export default async function NewTemplate(){
  await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
  const categories=await prisma.category.findMany({orderBy:{name:'asc'}});
  return <main className="admin-content"><p className="eyebrow">CATALOG</p><h1 className="admin-title">New template</h1><p className="mt-2 text-sm text-slate-400">Create the listing, project details, and documentation in one place.</p><div className="mt-8"><TemplateCmsForm categories={categories}/></div></main>;
}
