import {notFound} from 'next/navigation';
import {CourseForm} from '../../form';
import {prisma} from '@/lib/prisma';
import {requireAdmin} from '@/lib/auth';
import {RoleCode} from '@prisma/client';
export const dynamic='force-dynamic';
export default async function EditCourse({params}:{params:Promise<{id:string}>}){await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);const {id}=await params;const [course,categories,instructors]=await Promise.all([prisma.course.findUnique({where:{id}}),prisma.courseCategory.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{role:{code:{in:[RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]}}},select:{id:true,name:true},orderBy:{name:'asc'}})]);if(!course)notFound();return <main className="admin-content"><p className="eyebrow">COURSE BUILDER</p><h1 className="admin-title">Edit course</h1><div className="mt-8"><CourseForm course={course} categories={categories} instructors={instructors}/></div></main>}
