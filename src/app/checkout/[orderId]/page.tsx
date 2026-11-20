import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {CheckoutResult} from '../checkout-result';
export const dynamic='force-dynamic';
export default async function OrderConfirmation({params}:{params:Promise<{orderId:string}>}){
  const user=await requireUser();const {orderId}=await params;
  const order=await prisma.order.findFirst({where:{id:orderId,userId:user.id},include:{items:{include:{template:{select:{thumbnailUrl:true}}}}}});
  if(!order)notFound();
  return <CheckoutResult orderId={order.id} orderNumber={order.orderNumber} customerName={order.customerName} currency={order.currency} totalMmk={order.totalMmk} initialStatus={order.status} kind="processing" items={order.items.map(item=>({name:item.templateName,license:item.licenseTypeCode,priceMmk:item.unitPriceMmk,imageUrl:item.template?.thumbnailUrl||null}))}/>;
}
