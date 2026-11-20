import Link from 'next/link';
import {prisma} from '@/lib/prisma';
import {requireCmsEditor} from '@/lib/auth';
import {PostEditor} from '../../PostEditor';
export default async function NewPost(){await requireCmsEditor();const [categories,tags,users]=await Promise.all([prisma.blogCategory.findMany({orderBy:{name:'asc'}}),prisma.blogTag.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{role:{code:{in:['SUPER_ADMIN','ADMIN','EDITOR']}}},select:{id:true,name:true,email:true},orderBy:{name:'asc'}})]);return <main className="admin-content"><Link href="/admin/blog/posts" className="text-sm text-slate-400">← Posts</Link><h1 className="admin-title mt-5">New post</h1><div className="mt-8"><PostEditor categories={categories} tags={tags} users={users}/></div></main>}
