import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {getCartForIdentity,getGuestId} from '@/lib/cart';
import {prisma} from '@/lib/prisma';
import {money} from '@/lib/data';
export const dynamic='force-dynamic';
export async function GET(){const user=await currentUser();const guestId=user?null:await getGuestId(false);const cart=await getCartForIdentity({userId:user?.id,guestId});const items=cart?.items.filter(item=>item.template.status==='PUBLISHED')||[];const priced=await Promise.all(items.map(async item=>{const price=await prisma.productLicensePrice.findFirst({where:{productId:item.templateId,licenseTypeId:item.licenseTypeId||undefined,isActive:true,licenseType:{isActive:true}},include:{licenseType:true}});return {id:item.id,templateId:item.templateId,slug:item.template.slug,name:item.template.name,thumbnailUrl:item.template.thumbnailUrl,license:price?.licenseType.name||'License',priceMmk:price?.priceMmk||0,price:money(price?.priceMmk||0)};}));return NextResponse.json({items:priced,totalMmk:priced.reduce((sum,item)=>sum+item.priceMmk,0),total:money(priced.reduce((sum,item)=>sum+item.priceMmk,0))});}
