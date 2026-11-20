import {NextResponse} from 'next/server';
import {currentUser} from '@/lib/auth';
import {getCartForIdentity,getGuestId} from '@/lib/cart';
import {prisma} from '@/lib/prisma';
export const dynamic='force-dynamic';
export async function GET(){const user=await currentUser();const guestId=user?null:await getGuestId(false);const cart=await getCartForIdentity({userId:user?.id,guestId});const wishlist=await prisma.wishlistItem.count({where:user?{customerId:user.id}:{guestId:guestId||'__none__'}});return NextResponse.json({cartCount:cart?.items.length||0,wishlistCount:wishlist});}
