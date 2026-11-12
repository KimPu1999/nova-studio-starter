'use server';
import {revalidatePath} from 'next/cache';
import {RoleCode} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {requireAdmin,csrfCheck} from '@/lib/auth';
import {campaignSchema,marketingConsentSchema} from '@/lib/validation';

const text=(formData:FormData,key:string)=>String(formData.get(key)||'').trim();

export async function saveCampaign(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]); await csrfCheck();
  const parsed=campaignSchema.safeParse({id:text(formData,'id')||undefined,name:text(formData,'name'),type:text(formData,'type'),objective:text(formData,'objective'),startsAt:text(formData,'startsAt')||undefined,endsAt:text(formData,'endsAt')||undefined,budgetMmk:text(formData,'budgetMmk')||undefined,status:text(formData,'status')||'DRAFT'});
  if(!parsed.success)throw new Error(parsed.error.issues[0]?.message||'Invalid campaign.');
  const d=parsed.data;
  const startsAt=d.startsAt?new Date(d.startsAt):null; const endsAt=d.endsAt?new Date(d.endsAt):null;
  if(d.status==='ACTIVE')throw new Error('Campaigns must be explicitly approved before activation.');
  const campaign=d.id?await prisma.marketingCampaign.update({where:{id:d.id},data:{name:d.name,type:d.type,objective:d.objective,startsAt,endsAt,budgetMmk:d.budgetMmk??null,status:d.status}}):await prisma.marketingCampaign.create({data:{name:d.name,type:d.type,objective:d.objective,startsAt,endsAt,budgetMmk:d.budgetMmk??null,status:'DRAFT',createdById:user.id}});
  await prisma.auditLog.create({data:{userId:user.id,action:d.id?'UPDATE':'CREATE',entity:'MarketingCampaign',entityId:campaign.id,metadata:{status:d.status}}});
  revalidatePath('/admin/marketing/campaigns');
}

export async function approveCampaign(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]); await csrfCheck(); const id=text(formData,'id');
  const result=await prisma.marketingCampaign.updateMany({where:{id,status:{in:['DRAFT','SCHEDULED','PAUSED']}},data:{status:'SCHEDULED',publishedAt:new Date()}});
  if(result.count!==1)throw new Error('Campaign cannot be approved.');
  await prisma.auditLog.create({data:{userId:user.id,action:'CAMPAIGN_APPROVED',entity:'MarketingCampaign',entityId:id}}); revalidatePath('/admin/marketing/campaigns');
}

export async function saveMarketingConsent(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]); await csrfCheck();
  const userId=text(formData,'userId'); const parsed=marketingConsentSchema.safeParse({marketingEmail:text(formData,'marketingEmail'),source:text(formData,'source')||undefined});
  if(!parsed.success||!userId)throw new Error('Invalid consent update.');
  const allowed=parsed.data.marketingEmail==='true';
  await prisma.marketingConsent.upsert({where:{userId},update:{marketingEmail:allowed,source:parsed.data.source||null,consentedAt:allowed?new Date():undefined,withdrawnAt:allowed?null:new Date()},create:{userId,marketingEmail:allowed,source:parsed.data.source||null,consentedAt:allowed?new Date():null,withdrawnAt:allowed?null:new Date()}});
  await prisma.auditLog.create({data:{userId:user.id,action:'MARKETING_CONSENT_CHANGED',entity:'MarketingConsent',entityId:userId,metadata:{marketingEmail:allowed}}}); revalidatePath('/admin/marketing/subscribers');
}
