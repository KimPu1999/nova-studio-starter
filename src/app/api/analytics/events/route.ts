import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {recordAnalyticsEvent} from '@/lib/analytics';

export const runtime='nodejs';
export async function POST(request:Request){
  try{
    const body=await request.json();
    if(JSON.stringify(body).length>10_000)return NextResponse.json({error:'Event is too large.'},{status:413});
    const user=await currentUser();
    const result=await recordAnalyticsEvent(body,user?.id);
    if(!result.ok)return NextResponse.json({error:result.error},{status:400});
    return NextResponse.json({ok:true,duplicate:result.duplicate},{status:result.duplicate?200:201});
  }catch{return NextResponse.json({error:'Unable to record event.'},{status:400});}
}
