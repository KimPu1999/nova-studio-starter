import {prisma} from '@/lib/prisma';
import {analyticsEventSchema} from '@/lib/validation';

const recentRequests=new Map<string,{count:number;resetAt:number}>();

export async function recordAnalyticsEvent(input: unknown, userId?: string){
  const parsed=analyticsEventSchema.safeParse(input);
  if(!parsed.success) return {ok:false as const,error:'Invalid analytics event.'};
  const now=Date.now();
  const key=userId||parsed.data.anonymousId||'anonymous';
  const current=recentRequests.get(key);
  if(!current||current.resetAt<=now) recentRequests.set(key,{count:1,resetAt:now+60_000});
  else { current.count+=1; if(current.count>60) return {ok:false as const,error:'Too many analytics events.'}; }
  if(parsed.data.idempotencyKey){
    const existing=await prisma.analyticsEvent.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey},select:{id:true}});
    if(existing) return {ok:true as const,duplicate:true};
  }
  try{await prisma.analyticsEvent.create({data:{eventName:parsed.data.eventName,userId:userId||null,anonymousId:parsed.data.anonymousId||null,sessionId:parsed.data.sessionId||null,path:parsed.data.path||null,payload:parsed.data.payload, idempotencyKey:parsed.data.idempotencyKey||null,occurredAt:parsed.data.occurredAt||new Date()}});}
  catch(error){if(parsed.data.idempotencyKey){const existing=await prisma.analyticsEvent.findUnique({where:{idempotencyKey:parsed.data.idempotencyKey},select:{id:true}});if(existing)return {ok:true as const,duplicate:true};}throw error;}
  return {ok:true as const,duplicate:false};
}
