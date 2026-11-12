import {CourseForm} from '../form';
import {prisma} from '@/lib/prisma';
import {requireAdmin} from '@/lib/auth';
import {RoleCode} from '@prisma/client';
export const dynamic='force-dynamic';
export default async function NewCourse(){await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);const [categories,instructors]=await Promise.all([prisma.courseCategory.findMany({orderBy:{name:'asc'}}),prisma.user.findMany({where:{role:{code:{in:[RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]}}},select:{id:true,name:true},orderBy:{name:'asc'}})]);return <main className="admin-content"><p className="eyebrow">COURSE BUILDER</p><h1 className="admin-title">New course</h1><div className="mt-8"><CourseForm categories={categories} instructors={instructors}/></div></main>}
