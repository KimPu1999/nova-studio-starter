import {notFound} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {prisma} from '@/lib/prisma';
import {CheckoutResult} from './checkout-result';

export async function ResultPage({searchParams,kind}:{searchParams:Promise<{orderId?:string}>;kind:'success'|'failed'|'cancelled'|'processing'}){
  const user=await requireUser();
  const query=await searchParams;
  if(!query.orderId)notFound();
  const order=await prisma.order.findFirst({where:{id:query.orderId,userId:user.id},include:{items:{include:{template:{select:{thumbnailUrl:true}}}}}});
  if(!order)notFound();
  return <CheckoutResult orderId={order.id} orderNumber={order.orderNumber} customerName={order.customerName} currency={order.currency} totalMmk={order.totalMmk} initialStatus={order.status} kind={kind} items={order.items.map(item=>({name:item.templateName,license:item.licenseTypeCode,priceMmk:item.unitPriceMmk,imageUrl:item.template?.thumbnailUrl||null}))}/>;
}
