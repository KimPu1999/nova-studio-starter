import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {getCartForIdentity,getGuestId,getCartLicensePrices} from '@/lib/cart';
import {prisma} from '@/lib/prisma';
import {money} from '@/lib/data';
export const dynamic='force-dynamic';
export async function GET(){const user=await currentUser();const guestId=user?null:await getGuestId(false);const cart=await getCartForIdentity({userId:user?.id,guestId});const items=cart?.items||[];const prices=await getCartLicensePrices(items.map(item=>item.templateId));const priced=items.map(item=>{const available=prices.filter(price=>price.productId===item.templateId);const price=available.find(value=>value.licenseTypeId===item.licenseTypeId)||available[0];return {id:item.id,templateId:item.templateId,slug:item.template.slug,name:item.template.name,thumbnailUrl:item.template.thumbnailUrl,license:price?.licenseType.name||'License',priceMmk:price?.priceMmk||0,price:money(price?.priceMmk||0)};});const totalMmk=priced.reduce((sum,item)=>sum+item.priceMmk,0);return NextResponse.json({items:priced,totalMmk,total:money(totalMmk)},{headers:{'Cache-Control':'private, no-store'}});}
