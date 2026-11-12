'use server';

import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { RoleCode, SupportPriority, SupportTicketStatus, RefundStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { csrfCheck, currentUser, requireSupportAgent, requireSupportAdmin, requireUser } from '@/lib/auth';
import { refundRequestSchema, supportFeedbackSchema, supportMessageSchema, supportStatusSchema, supportTicketSchema } from '@/lib/validation';
import { knowledgeArticleSchema } from '@/lib/validation';

const staffRoles = [RoleCode.SUPER_ADMIN, RoleCode.ADMIN, RoleCode.SUPPORT_AGENT];
const transitions: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ['IN_PROGRESS'], IN_PROGRESS: ['WAITING_FOR_CUSTOMER', 'RESOLVED'],
  WAITING_FOR_CUSTOMER: ['IN_PROGRESS'], RESOLVED: ['CLOSED', 'OPEN'], CLOSED: ['OPEN'],
};

function value(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function ticketNumber() { return `SUP-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomInt(100000, 999999)}`; }
async function notifyStaff(type: string, title: string, body: string, href: string) {
  const users = await prisma.user.findMany({ where: { role: { code: { in: staffRoles } } }, select: { id: true } });
  if (users.length) await prisma.notification.createMany({ data: users.map(user => ({ userId: user.id, type, title, body, href })) });
}
async function notifyUser(userId: string, type: string, title: string, body: string, href: string) {
  await prisma.notification.create({ data: { userId, type, title, body, href } });
}

export async function createSupportTicket(formData: FormData) {
  await csrfCheck(); const user = await requireUser();
  const parsed = supportTicketSchema.safeParse({ subject: value(formData,'subject'), description: value(formData,'description'), categoryId: value(formData,'categoryId'), relatedOrderId: value(formData,'relatedOrderId'), relatedProjectId: value(formData,'relatedProjectId'), relatedEnrollmentId: value(formData,'relatedEnrollmentId') });
  if (!parsed.success) throw new Error('');
  const data = parsed.data;
  const category = await prisma.supportCategory.findFirst({ where: { id: data.categoryId, isEnabled: true } });
  if (!category) throw new Error('');
  if (data.relatedOrderId && !(await prisma.order.findFirst({ where: { id: data.relatedOrderId, userId: user.id } }))) throw new Error('');
  if (data.relatedProjectId && !(await prisma.project.findFirst({ where: { id: data.relatedProjectId, clientId: user.id } }))) throw new Error('');
  if (data.relatedEnrollmentId && !(await prisma.courseEnrollment.findFirst({ where: { id: data.relatedEnrollmentId, studentId: user.id } }))) throw new Error('');
  const policy = await prisma.supportSlaPolicy.findUnique({ where: { priority: SupportPriority.NORMAL } });
  const now = new Date();
  const ticket = await prisma.$transaction(async tx => {
    const created = await tx.supportTicket.create({ data: { ticketNumber: ticketNumber(), customerId: user.id, categoryId: data.categoryId, subject: data.subject, description: data.description, relatedOrderId: data.relatedOrderId || null, relatedProjectId: data.relatedProjectId || null, relatedEnrollmentId: data.relatedEnrollmentId || null, slaResponseDueAt: policy ? new Date(now.getTime()+policy.firstResponseMinutes*60000) : null, slaResolutionDueAt: policy ? new Date(now.getTime()+policy.resolutionMinutes*60000) : null } });
    await tx.supportMessage.create({ data: { ticketId: created.id, senderId: user.id, body: data.description } });
    await tx.supportStatusHistory.create({ data: { ticketId: created.id, actorId: user.id, toStatus: 'OPEN', reason: 'Ticket created' } });
    return created;
  });
  await notifyStaff('SUPPORT_TICKET_CREATED', 'New support ticket', `${user.name} opened ${ticket.ticketNumber}.`, `/admin/support/tickets/${ticket.id}`);
  redirect(`/support/tickets/${ticket.id}`);
}

export async function replySupportTicket(formData: FormData) {
  await csrfCheck(); const user = await currentUser(); if (!user) throw new Error('');
  const parsed = supportMessageSchema.safeParse({ ticketId: value(formData,'ticketId'), body: value(formData,'body'), isInternal: value(formData,'isInternal') || 'false' });
  if (!parsed.success) throw new Error('');
  const ticket = await prisma.supportTicket.findUnique({ where: { id: parsed.data.ticketId }, select: { id:true, customerId:true, assignedAgentId:true, status:true, ticketNumber:true } });
  if (!ticket) throw new Error('');
  const staff = (staffRoles as readonly string[]).includes(user.role.code);
  if (!staff && ticket.customerId !== user.id) throw new Error('');
  if (parsed.data.isInternal === 'true' && !staff) throw new Error('');
  if (staff && user.role.code === RoleCode.SUPPORT_AGENT && ticket.assignedAgentId !== user.id) throw new Error('');
  await prisma.$transaction(async tx => {
    await tx.supportMessage.create({ data: { ticketId: ticket.id, senderId: user.id, body: parsed.data.body, isInternal: parsed.data.isInternal === 'true' } });
    if (!parsed.data.isInternal) {
      const next = staff ? 'WAITING_FOR_CUSTOMER' : (ticket.status === 'WAITING_FOR_CUSTOMER' ? 'IN_PROGRESS' : undefined);
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { ...(next ? { status: next } : {}), ...(staff ? { firstResponseAt: new Date() } : {}) } });
    }
  });
  if (staff) await notifyUser(ticket.customerId, 'SUPPORT_AGENT_REPLIED', 'Support replied', `There is a new reply on ${ticket.ticketNumber}.`, `/support/tickets/${ticket.id}`);
  else await notifyStaff('SUPPORT_CUSTOMER_REPLIED', 'Customer replied', `A customer replied on ${ticket.ticketNumber}.`, `/admin/support/tickets/${ticket.id}`);
  redirect(staff ? `/admin/support/tickets/${ticket.id}` : `/support/tickets/${ticket.id}`);
}

export async function changeSupportStatus(formData: FormData) {
  await csrfCheck(); const user = await currentUser(); if (!user) throw new Error('');
  const parsed = supportStatusSchema.safeParse({ ticketId:value(formData,'ticketId'), toStatus:value(formData,'toStatus'), reason:value(formData,'reason') }); if (!parsed.success) throw new Error('');
  const ticket = await prisma.supportTicket.findUnique({ where:{id:parsed.data.ticketId}, select:{id:true,customerId:true,assignedAgentId:true,status:true,ticketNumber:true} }); if (!ticket) throw new Error('');
  const staff = (staffRoles as readonly string[]).includes(user.role.code);
  if (!staff && ticket.customerId !== user.id) throw new Error('');
  if (staff && user.role.code === RoleCode.SUPPORT_AGENT && ticket.assignedAgentId !== user.id) throw new Error('');
  const customerAllowed = ticket.status === 'RESOLVED' && (parsed.data.toStatus === 'CLOSED' || parsed.data.toStatus === 'OPEN') || ticket.status === 'CLOSED' && parsed.data.toStatus === 'OPEN';
  if (!staff && !customerAllowed) throw new Error('');
  if (!transitions[ticket.status].includes(parsed.data.toStatus)) throw new Error('');
  await prisma.$transaction(async tx => { await tx.supportTicket.update({where:{id:ticket.id},data:{status:parsed.data.toStatus, resolvedAt:parsed.data.toStatus==='RESOLVED'?new Date():undefined, closedAt:parsed.data.toStatus==='CLOSED'?new Date():undefined}}); await tx.supportStatusHistory.create({data:{ticketId:ticket.id,actorId:user.id,fromStatus:ticket.status,toStatus:parsed.data.toStatus,reason:parsed.data.reason||null}}); await tx.auditLog.create({data:{userId:user.id,action:'SUPPORT_STATUS_CHANGED',entity:'SupportTicket',entityId:ticket.id,metadata:{from:ticket.status,to:parsed.data.toStatus,reason:parsed.data.reason||null}}}); });
  if (ticket.customerId !== user.id) await notifyUser(ticket.customerId,'SUPPORT_STATUS_CHANGED','Ticket status updated',`${ticket.ticketNumber} is now ${parsed.data.toStatus.replaceAll('_',' ').toLowerCase()}.`,`/support/tickets/${ticket.id}`);
  redirect(staff ? `/admin/support/tickets/${ticket.id}` : `/support/tickets/${ticket.id}`);
}

export async function submitSupportFeedback(formData: FormData) {
  await csrfCheck(); const user=await requireUser(); const parsed=supportFeedbackSchema.safeParse({ticketId:value(formData,'ticketId'),rating:value(formData,'rating'),comment:value(formData,'comment')}); if(!parsed.success)throw new Error('');
  const ticket=await prisma.supportTicket.findFirst({where:{id:parsed.data.ticketId,customerId:user.id,status:{in:['RESOLVED','CLOSED']}}}); if(!ticket)throw new Error('');
  try { await prisma.supportFeedback.create({data:{ticketId:ticket.id,customerId:user.id,rating:parsed.data.rating,comment:parsed.data.comment||null}}); } catch { throw new Error(''); }
  redirect(`/support/tickets/${ticket.id}`);
}

export async function assignSupportAgent(formData: FormData) {
  await csrfCheck(); const admin=await requireSupportAdmin(); const ticketId=value(formData,'ticketId'); const agentId=value(formData,'agentId');
  const agent=await prisma.user.findFirst({where:{id:agentId,role:{code:{in:[RoleCode.SUPPORT_AGENT,RoleCode.ADMIN,RoleCode.SUPER_ADMIN]}}}}); if(!agent)throw new Error('');
  await prisma.$transaction(async tx=>{await tx.supportAssignment.updateMany({where:{ticketId,unassignedAt:null},data:{unassignedAt:new Date()}});await tx.supportAssignment.create({data:{ticketId,agentId,assignedById:admin.id}});await tx.supportTicket.update({where:{id:ticketId},data:{assignedAgentId:agentId}});await tx.auditLog.create({data:{userId:admin.id,action:'SUPPORT_AGENT_ASSIGNED',entity:'SupportTicket',entityId:ticketId,metadata:{agentId}}});});
  redirect(`/admin/support/tickets/${ticketId}`);
}

export async function createRefundRequest(formData: FormData) {
  await csrfCheck(); const user=await requireUser(); const parsed=refundRequestSchema.safeParse({orderId:value(formData,'orderId'),coursePurchaseId:value(formData,'coursePurchaseId'),projectInvoiceId:value(formData,'projectInvoiceId'),reason:value(formData,'reason'),amountMmk:value(formData,'amountMmk')||undefined}); if(!parsed.success)throw new Error(''); const d=parsed.data;
  let max=0; if(d.orderId){const o=await prisma.order.findFirst({where:{id:d.orderId,userId:user.id},select:{totalMmk:true}});if(!o)throw new Error('');max=o.totalMmk;} if(d.coursePurchaseId){const p=await prisma.coursePurchase.findFirst({where:{id:d.coursePurchaseId,buyerId:user.id},select:{unitPriceMmk:true}});if(!p)throw new Error('');max=p.unitPriceMmk;} if(d.projectInvoiceId){const i=await prisma.projectInvoice.findFirst({where:{id:d.projectInvoiceId,clientId:user.id},select:{totalMmk:true}});if(!i)throw new Error('');max=i.totalMmk;}
  const amount=d.amountMmk??max;if(amount<1||amount>max)throw new Error(''); const request=await prisma.refundRequest.create({data:{requestNumber:`REF-${Date.now()}-${crypto.randomInt(100,999)}`,customerId:user.id,orderId:d.orderId||null,coursePurchaseId:d.coursePurchaseId||null,projectInvoiceId:d.projectInvoiceId||null,requestedAmountMmk:amount,reason:d.reason}}); await notifyStaff('REFUND_REQUESTED','New refund request',`${user.name} submitted refund request ${request.requestNumber}.`,`/admin/refunds/${request.id}`); redirect(`/account/refunds/${request.id}`);
}

export async function reviewRefundRequest(formData: FormData) { await csrfCheck(); const admin=await requireSupportAdmin(); const id=value(formData,'id'); const status=value(formData,'status') as RefundStatus; const note=value(formData,'note'); if(!['UNDER_REVIEW','APPROVED','REJECTED','PROCESSING','COMPLETED','FAILED'].includes(status))throw new Error(''); const request=await prisma.refundRequest.findUnique({where:{id}});if(!request)throw new Error(''); if(request.status==='COMPLETED')throw new Error(''); await prisma.$transaction(async tx=>{await tx.refundRequest.update({where:{id},data:{status,reviewerId:admin.id,reviewerNote:note||null,reviewedAt:new Date(),completedAt:status==='COMPLETED'?new Date():undefined,approvedAmountMmk:status==='APPROVED'||status==='PROCESSING'||status==='COMPLETED'?request.requestedAmountMmk:undefined}});await tx.auditLog.create({data:{userId:admin.id,action:'REFUND_STATUS_CHANGED',entity:'RefundRequest',entityId:id,metadata:{from:request.status,to:status,note}}});}); await notifyUser(request.customerId,'REFUND_STATUS_UPDATED','Refund status updated',`${request.requestNumber} is now ${status.replaceAll('_',' ').toLowerCase()}.`,`/account/refunds/${id}`);redirect(`/admin/refunds/${id}`); }

export async function saveKnowledgeArticle(formData: FormData) { await csrfCheck(); const author=await requireSupportAdmin(); const parsed=knowledgeArticleSchema.safeParse({id:value(formData,'id')||undefined,categoryId:value(formData,'categoryId'),slug:value(formData,'slug'),title:value(formData,'title'),excerpt:value(formData,'excerpt'),content:value(formData,'content'),status:value(formData,'status'),language:value(formData,'language')}); if(!parsed.success)throw new Error(''); const d=parsed.data; const data={categoryId:d.categoryId,slug:d.slug,title:d.title,excerpt:d.excerpt,content:{text:d.content},status:d.status,authorId:author.id,publishedAt:d.status==='PUBLISHED'?new Date():null}; const article=d.id?await prisma.knowledgeArticle.update({where:{id:d.id},data}):await prisma.knowledgeArticle.create({data}); await prisma.auditLog.create({data:{userId:author.id,action:'KNOWLEDGE_ARTICLE_SAVED',entity:'KnowledgeArticle',entityId:article.id,metadata:{status:d.status,slug:d.slug}}}); redirect('/admin/help/articles'); }
