'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireAdmin} from '@/lib/auth';
import {RoleCode} from '@prisma/client';
export async function savePaymentSettings(formData:FormData){const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.FINANCE_ADMIN]);await csrfCheck();const mb=Math.max(1,Math.min(50,Number(formData.get('maxFileSizeMb')||10)));const message=String(formData.get('customerMessage')||'').trim().slice(0,500);await prisma.$transaction([prisma.siteSetting.upsert({where:{key:'manualPaymentMaxFileSizeMb'},create:{key:'manualPaymentMaxFileSizeMb',value:String(mb)},update:{value:String(mb)}}),prisma.siteSetting.upsert({where:{key:'manualPaymentCustomerMessage'},create:{key:'manualPaymentCustomerMessage',value:message},update:{value:message}}),prisma.auditLog.create({data:{userId:user.id,action:'UPDATE',entity:'PaymentSettings',metadata:{maxFileSizeMb:mb}}})]);revalidatePath('/admin/payments/settings');revalidatePath('/orders');}
