'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireAdmin} from '@/lib/auth';
import {RoleCode,PaymentSubmissionStatus} from '@prisma/client';
import {generateLicenseKey} from '@/lib/licensing';
import {createVendorEarnings} from '@/lib/vendor-ledger';
import {emitWebhookEventSafely} from '@/lib/webhooks/events';

const value=(formData:FormData,key:string)=>String(formData.get(key)||'').trim();
export async function reviewPaymentSubmission(formData:FormData){
 const reviewer=await requireAdmin([RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.FINANCE_ADMIN]);await csrfCheck();
 const submissionId=value(formData,'submissionId');const decision=value(formData,'decision') as PaymentSubmissionStatus;const reason=value(formData,'reason');const verificationNote=value(formData,'verificationNote');const actualTransactionConfirmed=value(formData,'actualTransactionConfirmed')==='true';
 if(!submissionId||!['APPROVED','REJECTED','NEEDS_RESUBMISSION'].includes(decision))throw new Error('Invalid payment review.');
 if(decision!=='APPROVED'&&reason.length<5)throw new Error('Provide a clear reason for this decision.');
 if(decision==='APPROVED'&&(!actualTransactionConfirmed||verificationNote.length<10))throw new Error('Confirm the actual KBZPay, WavePay, or bank transaction and add a verification note.');
 const result=await prisma.$transaction(async tx=>{
  const submission=await tx.paymentSubmission.findUnique({where:{id:submissionId},include:{order:{include:{items:true}},paymentMethod:true}});
  if(!submission||submission.status!=='PENDING'||submission.order.status!=='PAYMENT_REVIEW')throw new Error('This payment is no longer pending.');
  if(submission.submittedById===reviewer.id)throw new Error('Separation of duties: you cannot review your own payment submission.');
  if(submission.amountMmk!==submission.order.totalMmk||submission.currency!==submission.order.currency)throw new Error('Payment amount or currency does not match.');
  const claimed=await tx.paymentSubmission.updateMany({where:{id:submission.id,status:'PENDING'},data:{status:decision}});if(claimed.count!==1)throw new Error('This payment is already being reviewed.');
  if(decision==='APPROVED'){
   const orderUpdate=await tx.order.updateMany({where:{id:submission.orderId,status:'PAYMENT_REVIEW'},data:{status:'PAID',paidAt:new Date()}});if(orderUpdate.count!==1)throw new Error('This order is already resolved.');
   await createVendorEarnings(tx,submission.orderId,submission.order.items);
   for(const item of submission.order.items.filter(item=>item.templateId))await tx.downloadEntitlement.upsert({where:{orderId_templateId:{orderId:submission.orderId,templateId:item.templateId as string}},create:{orderId:submission.orderId,templateId:item.templateId as string,userId:submission.order.userId},update:{userId:submission.order.userId,revokedAt:null}});
   const licenseRows=submission.order.items.filter(i=>i.templateId&&i.licenseTypeId&&i.licenseTypeCode&&i.licensePriceMmk!==null).map(i=>({productId:i.templateId as string,licenseTypeId:i.licenseTypeId as string,orderId:submission.orderId,orderItemId:i.id,customerId:submission.order.userId,priceMmk:i.licensePriceMmk as number,licenseTerms:i.licenseTermsSnapshot||'',allowedUsage:i.licenseAllowedUsageSnapshot||'',licenseKey:generateLicenseKey()}));
   if(licenseRows.length)await tx.customerLicense.createMany({data:licenseRows,skipDuplicates:true});
  }else await tx.order.update({where:{id:submission.orderId},data:{status:'PENDING_PAYMENT'}});
  await tx.paymentReview.create({data:{submissionId:submission.id,reviewerId:reviewer.id,decision,rejectionReason:decision==='APPROVED'?null:reason,verifiedNote:decision==='APPROVED'?verificationNote:null}});
  await tx.paymentReviewEvent.create({data:{submissionId:submission.id,actorId:reviewer.id,action:decision==='APPROVED'?'APPROVED':decision==='NEEDS_RESUBMISSION'?'RESUBMISSION_REQUESTED':'REJECTED',previousStatus:'PENDING',nextStatus:decision,reason:decision==='APPROVED'?verificationNote:reason||null}});
  await tx.notification.create({data:{userId:submission.submittedById,type:decision==='APPROVED'?'PAYMENT_APPROVED':decision==='NEEDS_RESUBMISSION'?'PAYMENT_RESUBMISSION_REQUESTED':'PAYMENT_REJECTED',title:decision==='APPROVED'?'Payment verified':decision==='NEEDS_RESUBMISSION'?'More payment details are needed':'Payment receipt rejected',body:decision==='APPROVED'?`Your payment for ${submission.order.orderNumber} was verified.`:reason,href:`/account/orders/${submission.orderId}`}});
  await tx.auditLog.create({data:{userId:reviewer.id,action:`PAYMENT_${decision}`,entity:'PaymentSubmission',entityId:submission.id,metadata:{orderId:submission.orderId,reason,verificationNote,actualTransactionConfirmed}}});
  return decision==='APPROVED'?{orderId:submission.orderId,orderNumber:submission.order.orderNumber,totalMmk:submission.order.totalMmk,currency:submission.order.currency}:null;
 });
 if(result)emitWebhookEventSafely(null,'order.paid',{...result,paidAt:new Date().toISOString()});
 revalidatePath('/admin');revalidatePath('/admin/payments');revalidatePath('/admin/payments/reviews');revalidatePath(`/admin/payments/reviews/${submissionId}`);revalidatePath('/admin/orders');revalidatePath(`/account/orders/${value(formData,'orderId')}`);revalidatePath('/account/orders');revalidatePath('/account/licenses');
}
