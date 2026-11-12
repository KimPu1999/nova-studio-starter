'use server';
import crypto from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireUser} from '@/lib/auth';
import {vendorApplicationSchema,vendorPayoutRequestSchema} from '@/lib/validation';
import {canManageVendor,canManageVendorFinance,requireVendorMember} from '@/lib/vendors';

const text=(formData:FormData,key:string)=>String(formData.get(key)||'').trim();

export async function submitVendorApplication(formData:FormData){
  const user=await requireUser(); await csrfCheck();
  const parsed=vendorApplicationSchema.safeParse({sellerType:text(formData,'sellerType'),storeName:text(formData,'storeName'),storeSlug:text(formData,'storeSlug'),storeDescription:text(formData,'storeDescription'),contactEmail:text(formData,'contactEmail'),portfolioUrl:text(formData,'portfolioUrl'),businessInformation:text(formData,'businessInformation'),termsAccepted:text(formData,'termsAccepted')});
  if(!parsed.success)throw new Error(parsed.error.issues[0]?.message||'Please check the application.');
  const duplicate=await prisma.vendorApplication.findFirst({where:{applicantId:user.id,status:{in:['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED']}}});
  if(duplicate)throw new Error('You already have an active vendor application.');
  const slugTaken=await prisma.vendorProfile.findUnique({where:{storeSlug:parsed.data.storeSlug}}); if(slugTaken)throw new Error('That store slug is already in use.');
  const app=await prisma.vendorApplication.create({data:{applicantId:user.id,...parsed.data,portfolioUrl:parsed.data.portfolioUrl||null,businessInformation:parsed.data.businessInformation||null,termsAcceptedAt:new Date(),status:'SUBMITTED'}});
  await prisma.auditLog.create({data:{userId:user.id,action:'VENDOR_APPLICATION_SUBMITTED',entity:'VendorApplication',entityId:app.id}}); revalidatePath('/sell'); revalidatePath('/sell/apply');
}

export async function saveVendorProduct(formData:FormData){
  const user=await requireUser(); await csrfCheck(); const vendorId=text(formData,'vendorId'); const access=await requireVendorMember(vendorId); if(!canManageVendor(access.membership.role))throw new Error('Product management permission required.');
  const name=text(formData,'name'); const slug=text(formData,'slug'); const description=text(formData,'description'); const categoryId=text(formData,'categoryId'); const price=Number(text(formData,'priceMmk')); const demoUrl=text(formData,'demoUrl'); const tech=text(formData,'technology').split(',').map(x=>x.trim()).filter(Boolean); if(name.length<2||description.length<20||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||!Number.isInteger(price)||price<0||!categoryId)throw new Error('Invalid product fields.');
  const source=formData.get('sourceFile'); let fileData={}; if(source instanceof File&&source.size){if(source.size>100*1024*1024)throw new Error('Source archive must be under 100 MB.');const bytes=Buffer.from(await source.arrayBuffer());if(bytes[0]!==0x50||bytes[1]!==0x4b)throw new Error('Source file must be a ZIP archive.');const {putPrivateFile}=await import('@/lib/private-storage');const key=await putPrivateFile(bytes,'zip');fileData={sourceFileStorageKey:key,sourceFileName:source.name.replace(/[^a-z0-9._-]/gi,'_'),sourceFileSize:source.size};}
  const id=text(formData,'id'); const existing=id?await prisma.template.findFirst({where:{id,vendorId}}):null; if(id&&!existing)throw new Error('Product not found.'); const product=existing?await prisma.template.update({where:{id},data:{name,slug,description,categoryId,priceMmk:price,demoUrl:demoUrl||null,technology:tech,licenseType:'PERSONAL',vendorStatus:'SUBMITTED',status:'DRAFT',...fileData}}):await prisma.template.create({data:{name,slug,description,categoryId,priceMmk:price,demoUrl:demoUrl||null,technology:tech,licenseType:'PERSONAL',vendorId,status:'DRAFT',vendorStatus:'SUBMITTED',...fileData}}); await prisma.auditLog.create({data:{userId:user.id,action:id?'VENDOR_PRODUCT_UPDATE':'VENDOR_PRODUCT_SUBMIT',entity:'Template',entityId:product.id,metadata:{vendorId}}}); revalidatePath('/vendor/products');
}

export async function requestVendorPayout(formData:FormData){
  const user=await requireUser(); await csrfCheck(); const parsed=vendorPayoutRequestSchema.safeParse({vendorId:text(formData,'vendorId'),accountId:text(formData,'accountId'),amountMmk:text(formData,'amountMmk'),idempotencyKey:text(formData,'idempotencyKey')||crypto.randomUUID()}); if(!parsed.success)throw new Error('Invalid payout request.'); const access=await requireVendorMember(parsed.data.vendorId); if(!canManageVendorFinance(access.membership.role))throw new Error('Finance permission required.');
  const account=await prisma.vendorPayoutAccount.findFirst({where:{id:parsed.data.accountId,vendorId:parsed.data.vendorId,isActive:true}}); if(!account)throw new Error('Payout account not found.');
  await prisma.$transaction(async tx=>{const existing=await tx.vendorPayoutRequest.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey}});if(existing)return;const balance=await tx.vendorLedgerEntry.aggregate({where:{vendorId:parsed.data.vendorId},_sum:{amountMmk:true}});if((balance._sum.amountMmk||0)<parsed.data.amountMmk)throw new Error('Insufficient available vendor balance.');const payout=await tx.vendorPayoutRequest.create({data:{vendorId:parsed.data.vendorId,accountId:account.id,amountMmk:parsed.data.amountMmk,idempotencyKey:parsed.data.idempotencyKey}});await tx.vendorLedgerEntry.create({data:{vendorId:parsed.data.vendorId,eventType:'PAYOUT_RESERVATION',amountMmk:-parsed.data.amountMmk,sourceType:'VendorPayoutRequest',sourceId:payout.id,idempotencyKey:`${parsed.data.idempotencyKey}:reservation`}});}); await prisma.auditLog.create({data:{userId:user.id,action:'VENDOR_PAYOUT_REQUESTED',entity:'VendorPayoutRequest',entityId:parsed.data.idempotencyKey,metadata:{vendorId:parsed.data.vendorId,amountMmk:parsed.data.amountMmk}}}); revalidatePath('/vendor/payouts');
}
