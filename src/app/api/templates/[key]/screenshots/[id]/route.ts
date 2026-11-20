import {NextResponse} from 'next/server';
import {RoleCode} from '@prisma/client';
import {databaseConfigured,prisma} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';
import {getPrivateFile} from '@/lib/private-storage';

export async function GET(_request:Request,{params}:{params:Promise<{key:string;id:string}>}){
  const {key:idKey,id}=await params;
  const templateId=idKey;
  if(!/^[0-9a-f-]{36}$/i.test(templateId)||!/^[0-9a-f-]{36}$/i.test(id))return new NextResponse('Not found',{status:404});
  if(!databaseConfigured)return new NextResponse('Not found',{status:404});
  const screenshot=await prisma.templateScreenshot.findFirst({where:{id,templateId},include:{template:{select:{status:true}}}});
  if(!screenshot)return new NextResponse('Not found',{status:404});
  if(screenshot.template.status!=='PUBLISHED'){
    const user=await currentUser();
    if(!user||!([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR] as RoleCode[]).includes(user.role.code))return new NextResponse('Not found',{status:404});
  }
  try{
    const bytes=await getPrivateFile(screenshot.storageKey);
    return new NextResponse(bytes,{headers:{'Content-Type':screenshot.mimeType,'Cache-Control':'public, max-age=3600'}});
  }catch{return new NextResponse('Not found',{status:404});}
}
