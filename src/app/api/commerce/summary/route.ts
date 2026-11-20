import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {getGuestId} from '@/lib/cart';
import {prisma} from '@/lib/prisma';
export const dynamic='force-dynamic';
export async function GET(){const user=await currentUser();const guestId=user?null:await getGuestId(false);const identity=user?{cart:{userId:user.id}}:guestId?{cart:{guestId}}:{cart:{id:'00000000-0000-0000-0000-000000000000'}};const wishlistWhere=user?{customerId:user.id}:{guestId:guestId||'__none__'};const [cartCount,wishlistCount]=await Promise.all([prisma.cartItem.count({where:{...identity,template:{status:'PUBLISHED'}}}),prisma.wishlistItem.count({where:wishlistWhere})]);return NextResponse.json({cartCount,wishlistCount},{headers:{'Cache-Control':'private, no-store'}});}
