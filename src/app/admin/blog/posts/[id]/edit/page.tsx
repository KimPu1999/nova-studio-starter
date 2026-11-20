import Link from 'next/link';
import {notFound} from 'next/navigation';
import {prisma} from '@/lib/prisma';
import {requireCmsEditor} from '@/lib/auth';
import {PostEditor} from '../../../PostEditor';
export const dynamic='force-dynamic';
export default async function EditPost({params}:{params:Promise<{id:string}>}){await requireCmsEditor();const {id}=await params;const [post,categories,tags]=await Promise.all([prisma.blogPost.findUnique({where:{id},include:{tags:{include:{tag:true}}}}),prisma.blogCategory.findMany({orderBy:{name:'asc'}}),prisma.blogTag.findMany({orderBy:{name:'asc'}})]);if(!post)notFound();return <main className="admin-content"><Link href="/admin/blog/posts" className="text-sm text-slate-400">← Posts</Link><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow mt-5">EDITING</p><h1 className="admin-title">{post.title}</h1></div><span className="status-badge">{post.status}</span></div><div className="mt-8"><PostEditor post={post} categories={categories} tags={tags}/></div></main>}
