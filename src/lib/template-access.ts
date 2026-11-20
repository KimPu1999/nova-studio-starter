import type {TemplateAccessLevel} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import type {currentUser} from '@/lib/auth';

type User = Awaited<ReturnType<typeof currentUser>>;

export async function canAccessTemplateLevel(templateId:string, accessLevel:TemplateAccessLevel, user:User){
  if(accessLevel==='PUBLIC')return true;
  if(!user)return false;
  if(accessLevel==='AUTHENTICATED')return true;
  const [license,entitlement]=await Promise.all([
    prisma.customerLicense.findFirst({where:{productId:templateId,customerId:user.id,status:'ACTIVE',order:{status:'PAID'}},select:{id:true}}),
    prisma.downloadEntitlement.findFirst({where:{templateId,userId:user.id,revokedAt:null,order:{status:'PAID'}},select:{id:true}})
  ]);
  return Boolean(license||entitlement);
}

export async function canAccessTemplatePdf(templateId:string, accessLevel:TemplateAccessLevel, user:User){
  return canAccessTemplateLevel(templateId,accessLevel,user);
}
