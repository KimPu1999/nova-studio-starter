'use server';

import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
import {RoleCode,TemplateAccessLevel,TemplateStatus} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireAdmin} from '@/lib/auth';
import {putPrivateFile,removePrivateFile} from '@/lib/private-storage';
import {safeDownloadFilename} from '@/lib/security';
import {slugify} from '@/lib/template-docs';

const MAX_SCREENSHOT_SIZE=(Number(process.env.TEMPLATE_SCREENSHOT_MAX_MB)||8)*1024*1024;
const MAX_PDF_SIZE=(Number(process.env.TEMPLATE_PDF_MAX_MB)||25)*1024*1024;
const colorPattern=/^#[0-9a-f]{6}$/i;

function text(formData:FormData,key:string){return String(formData.get(key)||'').trim();}
function lines(value:string){return value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean).slice(0,100);}
function bool(formData:FormData,key:string){return text(formData,key)==='true';}
function safeColor(value:string,fallback:string){return colorPattern.test(value)?value:fallback;}
function validImage(bytes:Buffer,type:string){
  return type==='image/png'&&bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'||
    type==='image/jpeg'&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff||
    type==='image/webp'&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP';
}
function validPdf(bytes:Buffer){return bytes.subarray(0,5).toString('ascii')==='%PDF-';}
function safeName(value:string){return safeDownloadFilename(value,'file.bin');}
function parseSections(value:string){
  try{
    const parsed=JSON.parse(value||'[]');
    if(!Array.isArray(parsed))throw new Error();
    return parsed.slice(0,100).map((item,index)=>{
      const title=String(item?.title||'').trim().slice(0,160);
      const content=String(item?.content||'').trim().slice(0,100000);
      if(!title||!content)throw new Error('Each documentation section needs a title and content.');
      return {slug:slugify(title)+'-'+index,title,content,sortOrder:index};
    });
  }catch(error){
    if(error instanceof Error&&error.message.startsWith('Each'))throw error;
    throw new Error('Documentation sections are invalid.');
  }
}

export async function saveTemplateCms(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
  await csrfCheck();
  const id=text(formData,'id');
  const name=text(formData,'name');
  const slug=text(formData,'slug');
  const description=text(formData,'description');
  const categoryId=text(formData,'categoryId');
  const priceMmk=Number(text(formData,'priceMmk'));
  const status=text(formData,'status');
  const technology=lines(text(formData,'technologyText'));
  if(!name||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!description||!categoryId||!Number.isSafeInteger(priceMmk)||priceMmk<0||!['DRAFT','PUBLISHED','ARCHIVED'].includes(status))throw new Error('Please check the basic template fields.');
  const sections=parseSections(text(formData,'sectionsJson'));
  const source=formData.get('sourceFile');
  let sourceData:{sourceFileStorageKey?:string;sourceFileName?:string;sourceFileSize?:number}={};
  if(source instanceof File&&source.size){
    if(!([RoleCode.SUPER_ADMIN,RoleCode.ADMIN] as RoleCode[]).includes(user.role.code))throw new Error('Only admins can manage product ZIP files.');
    if(source.size>100*1024*1024)throw new Error('Product ZIP must be under 100 MB.');
    const bytes=Buffer.from(await source.arrayBuffer());
    if(!(bytes[0]===0x50&&bytes[1]===0x4b))throw new Error('Product file must be a ZIP archive.');
    sourceData={sourceFileStorageKey:await putPrivateFile(bytes,'zip'),sourceFileName:safeName(source.name),sourceFileSize:source.size};
  }
  const screenshotFiles=formData.getAll('screenshotFiles').filter((file):file is File=>file instanceof File&&file.size>0);
  const screenshotData:Array<{storageKey:string;originalFileName:string;mimeType:string;fileSize:number;altText:string}> = [];
  for(const file of screenshotFiles){
    if(file.size>MAX_SCREENSHOT_SIZE||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Screenshots must be PNG, JPG, or WEBP files under 8 MB.');
    const bytes=Buffer.from(await file.arrayBuffer());
    if(!validImage(bytes,file.type))throw new Error('A screenshot has an invalid file signature.');
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    screenshotData.push({storageKey:await putPrivateFile(bytes,ext),originalFileName:safeName(file.name),mimeType:file.type,fileSize:file.size,altText:text(formData,'screenshotAlt')||name});
  }
  const releaseDateValue=text(formData,'releaseDate');
  const releaseDate=releaseDateValue?new Date(releaseDateValue):null;
  const design={
    pageBackground:safeColor(text(formData,'pageBackground'),'#0B0D14'),
    cardBackground:safeColor(text(formData,'cardBackground'),'#151722'),
    accentColor:safeColor(text(formData,'accentColor'),'#7967F4'),
    headingColor:safeColor(text(formData,'headingColor'),'#F8F9FC'),
    bodyColor:safeColor(text(formData,'bodyColor'),'#A6A7BA'),
    contentWidth:text(formData,'contentWidth')||'1180px',
    imageAspectRatio:text(formData,'imageAspectRatio')||'16/9',
    spacing:text(formData,'spacing')||'comfortable',
    borderRadius:text(formData,'borderRadius')||'24px',
    layout:text(formData,'layout')||'premium',
    showDocumentation:bool(formData,'showDocumentation'),
    showScreenshots:bool(formData,'showScreenshots')
  };
  const accessLevel=(['PUBLIC','AUTHENTICATED','PURCHASER'].includes(text(formData,'documentationAccess'))?text(formData,'documentationAccess'):'PUBLIC') as TemplateAccessLevel;
  const featureLabels=lines(text(formData,'featuresText'));
  const requirements=lines(text(formData,'requirementsText'));
  const template=await prisma.$transaction(async tx=>{
    const saved=id?await tx.template.update({where:{id},data:{name,slug,description,priceMmk,categoryId,technology,licenseType:text(formData,'licenseType')||'Commercial',demoUrl:text(formData,'demoUrl')||null,thumbnailUrl:text(formData,'thumbnailUrl')||null,status:status as TemplateStatus,publishedAt:status==='PUBLISHED'?new Date():null,...sourceData}}):await tx.template.create({data:{name,slug,description,priceMmk,categoryId,technology,licenseType:text(formData,'licenseType')||'Commercial',demoUrl:text(formData,'demoUrl')||null,thumbnailUrl:text(formData,'thumbnailUrl')||null,status:status as TemplateStatus,publishedAt:status==='PUBLISHED'?new Date():null,...sourceData}});
    await tx.templateDetail.upsert({where:{templateId:saved.id},update:{fullDescription:text(formData,'fullDescription')||description,requirements,version:text(formData,'version')||null,releaseDate},create:{templateId:saved.id,fullDescription:text(formData,'fullDescription')||description,requirements,version:text(formData,'version')||null,releaseDate}});
    await tx.templateFeature.deleteMany({where:{templateId:saved.id}});
    if(featureLabels.length)await tx.templateFeature.createMany({data:featureLabels.map((label,sortOrder)=>({templateId:saved.id,label,sortOrder}))});
    const documentation=await tx.templateDocumentation.upsert({where:{templateId:saved.id},update:{accessLevel,isPublished:bool(formData,'documentationPublished')},create:{templateId:saved.id,accessLevel,isPublished:bool(formData,'documentationPublished')}});
    await tx.templateDocumentSection.deleteMany({where:{documentationId:documentation.id}});
    if(sections.length)await tx.templateDocumentSection.createMany({data:sections.map(section=>({...section,documentationId:documentation.id}))});
    await tx.templateDesignSettings.upsert({where:{templateId:saved.id},update:design,create:{templateId:saved.id,...design}});
    const removed=formData.getAll('removeScreenshotId').map(String).filter(Boolean);
    if(removed.length)await tx.templateScreenshot.deleteMany({where:{templateId:saved.id,id:{in:removed}}});
    if(screenshotData.length)await tx.templateScreenshot.createMany({data:screenshotData.map((item,index)=>({...item,templateId:saved.id,sortOrder:index}))});
    await tx.auditLog.create({data:{userId:user.id,action:id?'UPDATE':'CREATE',entity:'Template',entityId:saved.id,metadata:{name,hasDocumentation:sections.length>0,screenshotCount:screenshotData.length}}});
    return saved;
  });
  revalidatePath('/admin');
  revalidatePath('/admin/templates');
  revalidatePath('/admin/templates/'+template.id+'/edit');
  revalidatePath('/templates');
  revalidatePath('/templates/'+template.slug);
  revalidatePath('/templates/'+template.slug+'/docs');
  redirect('/admin/templates/'+template.id+'/edit?saved=1');
}

export async function uploadTemplatePdf(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
  await csrfCheck();
  const templateId=text(formData,'templateId');
  if(!templateId||!await prisma.template.findUnique({where:{id:templateId},select:{id:true}}))throw new Error('Template not found.');
  const file=formData.get('file');
  if(!(file instanceof File)||!file.size||file.size>MAX_PDF_SIZE||file.type!=='application/pdf')throw new Error('PDF must be under 25 MB.');
  const bytes=Buffer.from(await file.arrayBuffer());
  if(!validPdf(bytes))throw new Error('PDF file signature is invalid.');
  const accessLevel=(['PUBLIC','AUTHENTICATED','PURCHASER'].includes(text(formData,'accessLevel'))?text(formData,'accessLevel'):'PURCHASER') as TemplateAccessLevel;
  const pdf=await prisma.templatePdfFile.create({data:{templateId,title:text(formData,'title')||safeName(file.name),description:text(formData,'description')||null,storageKey:await putPrivateFile(bytes,'pdf'),originalFileName:safeName(file.name),mimeType:'application/pdf',fileSize:file.size,version:text(formData,'version')||null,sortOrder:Number(text(formData,'sortOrder'))||0,accessLevel,downloadEnabled:bool(formData,'downloadEnabled'),isVisible:true}});
  await prisma.auditLog.create({data:{userId:user.id,action:'CREATE',entity:'TemplatePdfFile',entityId:pdf.id}});
  revalidatePath('/admin/templates/'+templateId+'/edit');
  revalidatePath('/templates');
}

export async function updateTemplatePdf(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR]);
  await csrfCheck();
  const id=text(formData,'id');
  const accessLevel=(['PUBLIC','AUTHENTICATED','PURCHASER'].includes(text(formData,'accessLevel'))?text(formData,'accessLevel'):'PURCHASER') as TemplateAccessLevel;
  const pdf=await prisma.templatePdfFile.update({where:{id},data:{title:text(formData,'title'),description:text(formData,'description')||null,version:text(formData,'version')||null,sortOrder:Number(text(formData,'sortOrder'))||0,accessLevel,downloadEnabled:bool(formData,'downloadEnabled'),isVisible:bool(formData,'isVisible')}});
  await prisma.auditLog.create({data:{userId:user.id,action:'UPDATE',entity:'TemplatePdfFile',entityId:id}});
  revalidatePath('/admin/templates/'+pdf.templateId+'/edit');
  revalidatePath('/templates');
}

export async function deleteTemplatePdf(formData:FormData){
  const user=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]);
  await csrfCheck();
  const id=text(formData,'id');
  const pdf=await prisma.templatePdfFile.findUnique({where:{id}});
  if(!pdf)throw new Error('PDF not found.');
  await prisma.templatePdfFile.delete({where:{id}});
  await removePrivateFile(pdf.storageKey);
  await prisma.auditLog.create({data:{userId:user.id,action:'DELETE',entity:'TemplatePdfFile',entityId:id}});
  revalidatePath('/admin/templates/'+pdf.templateId+'/edit');
}
