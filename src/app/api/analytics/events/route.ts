import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {recordAnalyticsEvent} from '@/lib/analytics';
import {rateLimitCheck} from '@/lib/api/rate-limit';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    // Phase 19 — best-effort ingestion cap. The endpoint is intentionally
    // unauthenticated (public page events), so it is rate limited per client
    // IP as a durable Postgres counter (x-forwarded-for is spoofable; this is
    // spam mitigation, not an access control).
    const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
    const limit=await rateLimitCheck(`analytics-events:${ip}`,120,3_600_000);
    if(!limit.allowed)return NextResponse.json({error:'Too many events from this client.'},{status:429,headers:{'retry-after':String(limit.retryAfterSeconds)}});
    const body=await request.json();
    if(JSON.stringify(body).length>10_000)return NextResponse.json({error:'Event is too large.'},{status:413});
    const user=await currentUser();
    const result=await recordAnalyticsEvent(body,user?.id);
    if(!result.ok)return NextResponse.json({error:result.error},{status:400});
    return NextResponse.json({ok:true,duplicate:result.duplicate},{status:result.duplicate?200:201});
  }catch{return NextResponse.json({error:'Unable to record event.'},{status:400});}
}
