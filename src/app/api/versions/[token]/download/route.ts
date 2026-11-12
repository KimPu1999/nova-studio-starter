import crypto from 'node:crypto';
import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {getPrivateFile} from '@/lib/private-storage';
import {verifyVersionDownloadToken} from '@/lib/downloads';

export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){
  try{
    const user=await currentUser();if(!user)return new NextResponse('Unauthorized',{status:401});
    const {token}=await params;const payload=await verifyVersionDownloadToken(token);
    if(payload.userId!==user.id||!payload.licenseId||!payload.versionId)return new NextResponse('Link expired',{status:410});
    const version=await prisma.productVersion.findFirst({
      where:{id:payload.versionId,status:'PUBLISHED',product:{licenses:{some:{id:payload.licenseId,customerId:user.id,status:'ACTIVE'}}}},
      include:{files:true,product:{include:{licenses:{where:{id:payload.licenseId}}}}}
    });
    const license=version?.product.licenses[0];if(!version||!license||!version.files[0])return new NextResponse('Update unavailable',{status:404});
    const entitlement=await prisma.downloadEntitlement.findFirst({where:{orderId:license.orderId,templateId:license.productId,userId:user.id,revokedAt:null,order:{status:'PAID'}}});
    if(!entitlement)return new NextResponse('Download unavailable',{status:403});
    const file=await getPrivateFile(version.files[0].storageKey);const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    await prisma.downloadEvent.create({data:{entitlementId:entitlement.id,userId:user.id,ipHash:ip?crypto.createHash('sha256').update(ip).digest('hex'):undefined,userAgent:request.headers.get('user-agent')||undefined}});
    return new NextResponse(file,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${version.product.slug}-v${version.versionNumber}.zip"`,'Cache-Control':'private, no-store'}});
  }catch{return new NextResponse('Link expired',{status:410});}
}
