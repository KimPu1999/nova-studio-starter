'use server';
import {revalidatePath} from 'next/cache';
import {prisma} from '@/lib/prisma';
import {csrfCheck,requireUser} from '@/lib/auth';
import {paymentSubmissionSchema} from '@/lib/validation';
import {putPrivateFile,removePrivateFile} from '@/lib/private-storage';

const defaultMaxFileSize=Number(process.env.MANUAL_PAYMENT_MAX_FILE_SIZE_MB||10);
const signatures:{mime:string;ext:string;bytes:number[]}[]=[{mime:'image/jpeg',ext:'jpg',bytes:[0xff,0xd8,0xff]},{mime:'image/png',ext:'png',bytes:[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]},{mime:'application/pdf',ext:'pdf',bytes:[0x25,0x50,0x44,0x46,0x2d]}];
function validFile(buffer:Buffer,mime:string){return signatures.find(s=>s.mime===mime&&s.bytes.every((b,i)=>buffer[i]===b));}

export async function submitPayment(_prev:{error?:string;success?:string},formData:FormData):Promise<{error?:string;success?:string}>{
  const user=await requireUser();await csrfCheck();
  const parsed=paymentSubmissionSchema.safeParse({orderId:String(formData.get('orderId')||''),paymentMethodId:String(formData.get('paymentMethodId')||''),transactionReference:String(formData.get('transactionReference')||''),transferDate:String(formData.get('transferDate')||''),senderName:String(formData.get('senderName')||'')||undefined,senderAccountIdentifier:String(formData.get('senderAccountIdentifier')||'')||undefined,customerNotes:String(formData.get('customerNotes')||'')||undefined,idempotencyKey:String(formData.get('idempotencyKey')||'')});
  if(!parsed.success)return {error:'Please complete the payment details with a valid transfer date and reference.'};
  const configured=await prisma.siteSetting.findUnique({where:{key:'manualPaymentMaxFileSizeMb'},select:{value:true}});const maxFileSize=Math.max(1,Math.min(50,Number(configured?.value||defaultMaxFileSize)))*1024*1024;
  const file=formData.get('proof');
  if(!(file instanceof File)||file.size<1||file.size>maxFileSize)return {error:`Upload a JPG, PNG, or PDF up to ${Math.round(maxFileSize/1024/1024)} MB.`};
  const buffer=Buffer.from(await file.arrayBuffer());const signature=validFile(buffer,file.type);
  if(!signature)return {error:'The uploaded receipt does not match a supported JPG, PNG, or PDF file.'};
  const order=await prisma.order.findFirst({where:{id:parsed.data.orderId,userId:user.id},select:{id:true,orderNumber:true,totalMmk:true,currency:true,status:true,userId:true}});
  if(!order)return {error:'Order not found.'};
  if(!['PENDING_PAYMENT','PAYMENT_REVIEW'].includes(order.status))return {error:'This order cannot accept another payment submission.'};
  const method=await prisma.paymentMethod.findFirst({where:{id:parsed.data.paymentMethodId,isEnabled:true}});
  if(!method)return {error:'That payment method is unavailable.'};
  const active=await prisma.paymentSubmission.findFirst({where:{orderId:order.id,status:'PENDING'}});
  if(active&&order.status==='PAYMENT_REVIEW')return {error:'A payment submission is already under review.'};
  const recent=await prisma.paymentSubmission.count({where:{submittedById:user.id,createdAt:{gte:new Date(Date.now()-24*60*60_000)}}});
  if(recent>=10)return {error:'Too many submissions. Please try again later.'};
  const duplicate=await prisma.paymentSubmission.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey},select:{id:true}});
  if(duplicate)return {success:'This payment receipt was already submitted for review.'};
  const storageKey=await putPrivateFile(buffer,signature.ext);
  try{
    await prisma.$transaction(async tx=>{
      const existing=await tx.paymentSubmission.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey},select:{id:true}});if(existing)return;
      const claimed=await tx.order.updateMany({where:{id:order.id,userId:user.id,status:{in:['PENDING_PAYMENT','PAYMENT_REVIEW']}},data:{status:'PAYMENT_REVIEW'}});
      if(claimed.count!==1)throw new Error('payment-already-pending');
      const submission=await tx.paymentSubmission.create({data:{orderId:order.id,paymentMethodId:method.id,submittedById:user.id,amountMmk:order.totalMmk,currency:order.currency,transactionReference:parsed.data.transactionReference,transferDate:new Date(parsed.data.transferDate),senderName:parsed.data.senderName||null,senderAccountIdentifier:parsed.data.senderAccountIdentifier||null,customerNotes:parsed.data.customerNotes||null,proofStorageKey:storageKey,proofMimeType:signature.mime,proofFileSize:file.size,idempotencyKey:parsed.data.idempotencyKey}});
      await tx.paymentReviewEvent.create({data:{submissionId:submission.id,actorId:user.id,action:'SUBMITTED',nextStatus:'PENDING'}});
      const admins=await tx.user.findMany({where:{role:{code:{in:['SUPER_ADMIN','ADMIN','FINANCE_ADMIN']}}},select:{id:true}});
      if(admins.length)await tx.notification.createMany({data:admins.map(admin=>({userId:admin.id,type:'PAYMENT_REVIEW_REQUIRED',title:'Payment proof submitted',body:`${order.orderNumber} is ready for manual verification.`,href:`/admin/payments/reviews/${submission.id}`}))});
    });
  }catch(error){await removePrivateFile(storageKey);return {error:error instanceof Error&&error.message==='payment-already-pending'?'A payment submission is already under review.':'This payment submission could not be recorded. Please try again.'};}
  revalidatePath(`/orders/${order.id}/payment`);revalidatePath(`/account/orders/${order.id}`);revalidatePath('/account/orders');revalidatePath('/admin/payments');
  return {success:'Payment receipt submitted. NOVA will verify the transfer manually.'};
}
