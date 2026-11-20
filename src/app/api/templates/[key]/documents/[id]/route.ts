import {NextResponse} from 'next/server';
import {databaseConfigured,prisma} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';
import {getPrivateFile} from '@/lib/private-storage';
import {canAccessTemplatePdf} from '@/lib/template-access';
import {safeDownloadFilename} from '@/lib/security';

export async function GET(request:Request,{params}:{params:Promise<{key:string;id:string}>}){
  const {key:slug,id}=await params;
  if(!databaseConfigured)return new NextResponse('Not found',{status:404});
  if(!/^[0-9a-f-]{36}$/i.test(id))return new NextResponse('Not found',{status:404});
  const template=await prisma.template.findUnique({where:{slug,status:'PUBLISHED'},select:{id:true,slug:true}});
  if(!template)return new NextResponse('Not found',{status:404});
  const pdf=await prisma.templatePdfFile.findFirst({where:{id,templateId:template.id,isVisible:true}});
  if(!pdf)return new NextResponse('Not found',{status:404});
  const user=await currentUser();
  if(!await canAccessTemplatePdf(template.id,pdf.accessLevel,user))return new NextResponse(user?'Forbidden':'Unauthorized',{status:user?403:401});
  try{
    const bytes=await getPrivateFile(pdf.storageKey);
    const download=request.url.includes('download=1');
    return new NextResponse(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':(download&&pdf.downloadEnabled?'attachment':'inline')+'; filename="'+safeDownloadFilename(pdf.originalFileName,'document.pdf')+'"','Cache-Control':'private, no-store'}});
  }catch{return new NextResponse('Not found',{status:404});}
}
