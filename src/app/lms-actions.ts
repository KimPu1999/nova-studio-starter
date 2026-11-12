'use server';

import crypto from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {CoursePurchaseStatus,CourseStatus,EnrollmentStatus,LessonType,RoleCode} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireAdmin,requireUser} from '@/lib/auth';
import {putPrivateFile} from '@/lib/private-storage';
import {courseSchema,courseSectionSchema,lessonProgressSchema,lessonSchema} from '@/lib/validation';

const text=(formData:FormData,key:string)=>String(formData.get(key)||'');
const list=(value:string)=>value.split('\n').map(item=>item.trim()).filter(Boolean);

export async function saveCourse(formData:FormData){
 const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
 await csrfCheck();
 const parsed=courseSchema.safeParse({title:text(formData,'title'),slug:text(formData,'slug'),description:text(formData,'description'),categoryId:text(formData,'categoryId'),instructorId:text(formData,'instructorId'),difficulty:text(formData,'difficulty'),language:text(formData,'language'),priceMmk:text(formData,'priceMmk'),isFree:text(formData,'isFree'),estimatedDurationMinutes:text(formData,'estimatedDurationMinutes')||undefined,prerequisites:text(formData,'prerequisites'),learningOutcomes:text(formData,'learningOutcomes'),requirements:text(formData,'requirements'),status:text(formData,'status'),isFeatured:text(formData,'isFeatured')});
 if(!parsed.success)throw new Error('Please check the course fields.');
 const id=text(formData,'id');const isFree=parsed.data.isFree==='true';
 const data={title:parsed.data.title,slug:parsed.data.slug,description:parsed.data.description,categoryId:parsed.data.categoryId,instructorId:parsed.data.instructorId,difficulty:parsed.data.difficulty,language:parsed.data.language,priceMmk:isFree?0:parsed.data.priceMmk,isFree,estimatedDurationMinutes:parsed.data.estimatedDurationMinutes??null,prerequisites:list(parsed.data.prerequisites),learningOutcomes:list(parsed.data.learningOutcomes),requirements:list(parsed.data.requirements),status:parsed.data.status as CourseStatus,isFeatured:parsed.data.isFeatured==='true',publishedAt:parsed.data.status==='PUBLISHED'?new Date():null};
 const course=id?await prisma.course.update({where:{id},data}):await prisma.course.create({data});
 await prisma.auditLog.create({data:{userId:user.id,action:id?'UPDATE':'CREATE',entity:'Course',entityId:course.id,metadata:{status:course.status}}});
 revalidatePath('/courses');revalidatePath(`/courses/${course.slug}`);revalidatePath('/admin/courses');revalidatePath(`/admin/courses/${course.id}/edit`);
}

export async function saveCourseSection(formData:FormData){
 const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);await csrfCheck();
 const parsed=courseSectionSchema.safeParse({courseId:text(formData,'courseId'),title:text(formData,'title'),description:text(formData,'description'),sortOrder:text(formData,'sortOrder')});if(!parsed.success)throw new Error('Please check the section fields.');
 const course=await prisma.course.findUnique({where:{id:parsed.data.courseId},select:{id:true}});if(!course)throw new Error('Course not found.');
 const section=await prisma.courseSection.create({data:{courseId:parsed.data.courseId,title:parsed.data.title,description:parsed.data.description||null,sortOrder:parsed.data.sortOrder}});
 await prisma.auditLog.create({data:{userId:user.id,action:'CREATE',entity:'CourseSection',entityId:section.id,metadata:{courseId:course.id}}});revalidatePath(`/admin/courses/${course.id}/curriculum`);
}

export async function saveLesson(formData:FormData){
 const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);await csrfCheck();
 const parsed=lessonSchema.safeParse({sectionId:text(formData,'sectionId'),title:text(formData,'title'),slug:text(formData,'slug'),description:text(formData,'description'),content:text(formData,'content'),lessonType:text(formData,'lessonType'),videoDurationSeconds:text(formData,'videoDurationSeconds')||undefined,sortOrder:text(formData,'sortOrder'),isPreview:text(formData,'isPreview'),isPublished:text(formData,'isPublished')});if(!parsed.success)throw new Error('Please check the lesson fields.');
 const section=await prisma.courseSection.findUnique({where:{id:parsed.data.sectionId},select:{courseId:true}});if(!section)throw new Error('Course section not found.');
 const lesson=await prisma.lesson.create({data:{sectionId:parsed.data.sectionId,title:parsed.data.title,slug:parsed.data.slug,description:parsed.data.description||null,content:parsed.data.content?{blocks:[{type:'paragraph',text:parsed.data.content}]}:undefined,lessonType:parsed.data.lessonType as LessonType,videoDurationSeconds:parsed.data.videoDurationSeconds??null,sortOrder:parsed.data.sortOrder,isPreview:parsed.data.isPreview==='true',isPublished:parsed.data.isPublished==='true'}});
 await prisma.auditLog.create({data:{userId:user.id,action:'CREATE',entity:'Lesson',entityId:lesson.id,metadata:{courseId:section.courseId}}});revalidatePath(`/admin/courses/${section.courseId}/curriculum`);revalidatePath(`/learn/courses/${section.courseId}`);
}

export async function enrollFreeCourse(courseId:string){
 const user=await requireUser();await csrfCheck();const course=await prisma.course.findFirst({where:{id:courseId,status:CourseStatus.PUBLISHED,isFree:true}});if(!course)throw new Error('This free course is unavailable.');
 await prisma.courseEnrollment.upsert({where:{courseId_studentId:{courseId,studentId:user.id}},update:{status:EnrollmentStatus.ACTIVE},create:{courseId,studentId:user.id,status:EnrollmentStatus.ACTIVE}});revalidatePath('/learn');revalidatePath('/learn/my-courses');revalidatePath(`/learn/courses/${courseId}`);
}

export async function createCoursePurchase(courseId:string,paymentMethodId:string){
 const user=await requireUser();await csrfCheck();const course=await prisma.course.findFirst({where:{id:courseId,status:CourseStatus.PUBLISHED,isFree:false}});if(!course)throw new Error('This course is unavailable.');const method=await prisma.paymentMethod.findFirst({where:{id:paymentMethodId,isEnabled:true}});if(!method)throw new Error('Payment method is unavailable.');
 const existing=await prisma.coursePurchase.findFirst({where:{courseId,buyerId:user.id,status:{in:[CoursePurchaseStatus.PAID,CoursePurchaseStatus.PAYMENT_REVIEW,CoursePurchaseStatus.PENDING_PAYMENT]}}});
 const purchase=existing??await prisma.coursePurchase.create({data:{purchaseNumber:`COURSE-${Date.now()}-${crypto.randomInt(1000,9999)}`,courseId,buyerId:user.id,unitPriceMmk:course.priceMmk,paymentMethodId,idempotencyKey:crypto.randomUUID()}});redirect(`/courses/${course.slug}/enroll?purchase=${purchase.id}`);
}

export async function submitCoursePayment(formData:FormData){
 const user=await requireUser();await csrfCheck();const purchaseId=text(formData,'purchaseId');const reference=text(formData,'transactionReference').trim();if(reference.length<3||reference.length>120)throw new Error('Invalid transaction reference.');
 const purchase=await prisma.coursePurchase.findFirst({where:{id:purchaseId,buyerId:user.id,status:CoursePurchaseStatus.PENDING_PAYMENT}});if(!purchase)throw new Error('Payment submission is unavailable.');const file=formData.get('proof');if(!(file instanceof File)||!file.size)throw new Error('Payment proof is required.');if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.type))throw new Error('Use a PNG, JPEG, WEBP, or PDF under 5 MB.');const bytes=Buffer.from(await file.arrayBuffer());const valid=file.type==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':file.type==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8:file.type==='application/pdf'?bytes.subarray(0,4).toString()==='%PDF':bytes.subarray(0,4).toString('hex')==='52494646';if(!valid)throw new Error('Invalid payment proof signature.');
 const key=await putPrivateFile(bytes,'course-proof');await prisma.coursePurchase.update({where:{id:purchase.id},data:{transactionReference:reference,proofStorageKey:key,proofMimeType:file.type,status:CoursePurchaseStatus.PAYMENT_REVIEW}});revalidatePath('/admin/lms/payments');revalidatePath('/learn');
}

export async function approveCoursePurchase(purchaseId:string){
 const admin=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]);await csrfCheck();await prisma.$transaction(async tx=>{const purchase=await tx.coursePurchase.findUnique({where:{id:purchaseId}});if(!purchase||purchase.status!==CoursePurchaseStatus.PAYMENT_REVIEW)throw new Error('Purchase is not awaiting review.');const claimed=await tx.coursePurchase.updateMany({where:{id:purchase.id,status:CoursePurchaseStatus.PAYMENT_REVIEW},data:{status:CoursePurchaseStatus.PAID,reviewerId:admin.id,reviewedAt:new Date()}});if(claimed.count!==1)throw new Error('Purchase is already being reviewed.');await tx.courseEnrollment.upsert({where:{courseId_studentId:{courseId:purchase.courseId,studentId:purchase.buyerId}},update:{status:EnrollmentStatus.ACTIVE,purchaseId:purchase.id},create:{courseId:purchase.courseId,studentId:purchase.buyerId,purchaseId:purchase.id,status:EnrollmentStatus.ACTIVE}});await tx.auditLog.create({data:{userId:admin.id,action:'APPROVE',entity:'CoursePurchase',entityId:purchase.id,metadata:{courseId:purchase.courseId,amountMmk:purchase.unitPriceMmk}}});});revalidatePath('/admin/lms/payments');revalidatePath('/learn');
}

export async function markLessonProgress(formData:FormData){
 const user=await requireUser();await csrfCheck();const parsed=lessonProgressSchema.safeParse({lessonId:text(formData,'lessonId'),completed:text(formData,'completed'),lastPositionSeconds:text(formData,'lastPositionSeconds')||0});if(!parsed.success)throw new Error('Invalid lesson progress.');
 const lesson=await prisma.lesson.findUnique({where:{id:parsed.data.lessonId},include:{section:{include:{course:true}}}});if(!lesson)throw new Error('Lesson not found.');const enrollment=await prisma.courseEnrollment.findUnique({where:{courseId_studentId:{courseId:lesson.section.courseId,studentId:user.id}}});if(!enrollment||enrollment.status===EnrollmentStatus.REVOKED)throw new Error('Course access is required.');
 await prisma.lessonProgress.upsert({where:{enrollmentId_lessonId:{enrollmentId:enrollment.id,lessonId:lesson.id}},update:{completed:parsed.data.completed==='true',lastPositionSeconds:parsed.data.lastPositionSeconds,completedAt:parsed.data.completed==='true'?new Date():null},create:{enrollmentId:enrollment.id,lessonId:lesson.id,studentId:user.id,completed:parsed.data.completed==='true',lastPositionSeconds:parsed.data.lastPositionSeconds,completedAt:parsed.data.completed==='true'?new Date():null}});
 const total=await prisma.lesson.count({where:{section:{courseId:lesson.section.courseId},isPublished:true}});const done=await prisma.lessonProgress.count({where:{enrollmentId:enrollment.id,completed:true,lesson:{isPublished:true}}});if(total>0&&done>=total)await prisma.courseEnrollment.update({where:{id:enrollment.id},data:{status:EnrollmentStatus.COMPLETED,completedAt:new Date()}});revalidatePath(`/learn/courses/${lesson.section.courseId}`);revalidatePath(`/learn/courses/${lesson.section.courseId}/lessons/${lesson.id}`);
}
