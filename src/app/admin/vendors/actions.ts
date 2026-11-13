'use server';
import {revalidatePath} from 'next/cache';
import {RoleCode} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireAdmin} from '@/lib/auth';
const text=(formData:FormData,key:string)=>String(formData.get(key)||'').trim();
export async function reviewVendorApplication(formData:FormData){const reviewer=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN]);await csrfCheck();const id=text(formData,'id');const decision=text(formData,'decision');const note=text(formData,'note');if(!['APPROVED','REJECTED','UNDER_REVIEW'].includes(decision))throw new Error('Invalid vendor decision.');await prisma.$transaction(async tx=>{const app=await tx.vendorApplication.findUnique({where:{id}});if(!app||app.status==='APPROVED'&&decision==='APPROVED')throw new Error('Application is already resolved.');if(decision==='APPROVED'){const existing=await tx.vendorProfile.findUnique({where:{storeSlug:app.storeSlug}});const vendor=existing||await tx.vendorProfile.create({data:{ownerId:app.applicantId,storeName:app.storeName,storeSlug:app.storeSlug,storeDescription:app.storeDescription,contactEmail:app.contactEmail,portfolioUrl:app.portfolioUrl,isVerified:true}});await tx.vendorMember.upsert({where:{vendorId_userId:{vendorId:vendor.id,userId:app.applicantId}},update:{role:'VENDOR_OWNER',acceptedAt:new Date(),revokedAt:null},create:{vendorId:vendor.id,userId:app.applicantId,role:'VENDOR_OWNER',acceptedAt:new Date()}});await tx.vendorApplication.update({where:{id},data:{vendorId:vendor.id,status:'APPROVED',reviewerId:reviewer.id,reviewerNote:note||null,reviewedAt:new Date()}});}else await tx.vendorApplication.update({where:{id},data:{status:decision as 'REJECTED'|'UNDER_REVIEW',reviewerId:reviewer.id,reviewerNote:note||null,reviewedAt:new Date()}});await tx.auditLog.create({data:{userId:reviewer.id,action:`VENDOR_APPLICATION_${decision}`,entity:'VendorApplication',entityId:id,metadata:{note}}});});revalidatePath('/admin/vendors/applications');revalidatePath('/vendor');}

/**
 * Phase 19 — vendor payout lifecycle. Requests start as REQUESTED with the
 * amount reserved (negative PAYOUT_RESERVATION ledger entry). Finance can
 * approve, reject (releases the reservation), or complete (records the actual
 * transfer). Status transitions are claimed with guarded updateMany calls, so
 * concurrent reviewers cannot double-process a payout.
 */
export async function reviewVendorPayout(formData:FormData){
  const reviewer=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.FINANCE_ADMIN]);
  await csrfCheck();
  const id=text(formData,'id');
  const decision=text(formData,'decision');
  const note=text(formData,'note');
  if(!['APPROVED','REJECTED'].includes(decision))throw new Error('Invalid payout decision.');
  if(decision==='REJECTED'&&!note.trim())throw new Error('A rejection note is required.');
  await prisma.$transaction(async tx=>{
    const payout=await tx.vendorPayoutRequest.findUnique({where:{id}});
    if(!payout||!['REQUESTED','UNDER_REVIEW'].includes(payout.status))throw new Error('This payout request is no longer pending.');
    const claimed=await tx.vendorPayoutRequest.updateMany({where:{id,status:{in:['REQUESTED','UNDER_REVIEW']}},data:{status:decision as 'APPROVED'|'REJECTED',reviewerId:reviewer.id,reviewerNote:note||null,reviewedAt:new Date()}});
    if(claimed.count!==1)throw new Error('This payout request was already reviewed.');
    if(decision==='REJECTED'){
      // Release the reserved funds back into the vendor's available balance.
      const released=await tx.vendorLedgerEntry.findUnique({where:{eventType_sourceType_sourceId:{eventType:'PAYOUT_RELEASE',sourceType:'VendorPayoutRequest',sourceId:payout.id}}});
      if(!released)await tx.vendorLedgerEntry.create({data:{vendorId:payout.vendorId,eventType:'PAYOUT_RELEASE',amountMmk:payout.amountMmk,sourceType:'VendorPayoutRequest',sourceId:payout.id,idempotencyKey:`${payout.idempotencyKey}:release`,reason:`Payout rejected: ${note}`}});
    }
    await tx.auditLog.create({data:{userId:reviewer.id,action:`VENDOR_PAYOUT_${decision}`,entity:'VendorPayoutRequest',entityId:id,metadata:{note:note||null}}});
  });
  revalidatePath('/admin/vendors/payouts');
  revalidatePath('/vendor/payouts');
}

export async function completeVendorPayout(formData:FormData){
  const reviewer=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.FINANCE_ADMIN]);
  await csrfCheck();
  const id=text(formData,'id');
  const method=text(formData,'method');
  const reference=text(formData,'reference');
  if(!method.trim()||reference.trim().length<4)throw new Error('Record the payout method and transaction reference before marking it paid.');
  await prisma.$transaction(async tx=>{
    const payout=await tx.vendorPayoutRequest.findUnique({where:{id}});
    if(!payout||!['APPROVED','PROCESSING'].includes(payout.status))throw new Error('Only approved payouts can be completed.');
    // Overdraw guard: the reserved amount must still be covered by the ledger.
    const balance=await tx.vendorLedgerEntry.aggregate({where:{vendorId:payout.vendorId},_sum:{amountMmk:true}});
    if((balance._sum.amountMmk||0)<0)throw new Error('Vendor ledger balance is negative; resolve the ledger before completing this payout.');
    const claimed=await tx.vendorPayoutRequest.updateMany({where:{id,status:{in:['APPROVED','PROCESSING']}},data:{status:'PAID',reviewerId:payout.reviewerId??reviewer.id,reviewedAt:payout.reviewedAt??new Date(),paidAt:new Date()}});
    if(claimed.count!==1)throw new Error('This payout request was already completed.');
    await tx.vendorPayoutTransaction.create({data:{payoutRequestId:payout.id,amountMmk:payout.amountMmk,method:method.trim(),transactionReference:reference.trim(),confirmedById:reviewer.id,confirmedAt:new Date()}});
    // Marker entry: the reservation already removed the funds from the
    // available balance; completion records that the transfer actually left.
    const exists=await tx.vendorLedgerEntry.findUnique({where:{eventType_sourceType_sourceId:{eventType:'PAYOUT_COMPLETION',sourceType:'VendorPayoutRequest',sourceId:payout.id}}});
    if(!exists)await tx.vendorLedgerEntry.create({data:{vendorId:payout.vendorId,eventType:'PAYOUT_COMPLETION',amountMmk:0,sourceType:'VendorPayoutRequest',sourceId:payout.id,idempotencyKey:`${payout.idempotencyKey}:completion`,reason:`Payout completed via ${method.trim()}`}});
    await tx.auditLog.create({data:{userId:reviewer.id,action:'VENDOR_PAYOUT_COMPLETED',entity:'VendorPayoutRequest',entityId:id,metadata:{method:method.trim()}}});
  });
  revalidatePath('/admin/vendors/payouts');
  revalidatePath('/vendor/payouts');
}
