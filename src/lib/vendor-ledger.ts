import {Prisma} from '@prisma/client';

type VendorOrderItem={id:string;vendorId:string|null;vendorNameSnapshot:string|null;unitPriceMmk:number;platformCommissionMmk:number|null;vendorEarningMmk:number|null};

export async function createVendorEarnings(tx:Prisma.TransactionClient,orderId:string,items:VendorOrderItem[]){
  for(const item of items){
    if(!item.vendorId||item.vendorEarningMmk===null||item.platformCommissionMmk===null)continue;
    const earning=await tx.vendorEarning.upsert({where:{orderItemId:item.id},update:{},create:{vendorId:item.vendorId,orderItemId:item.id,grossMmk:item.unitPriceMmk,platformCommissionMmk:item.platformCommissionMmk,netMmk:item.vendorEarningMmk,availableAt:new Date(Date.now()+7*24*60*60*1000)}});
    const entries=[
      {eventType:'SALE_CREDIT' as const,amountMmk:item.unitPriceMmk,sourceId:item.id,idempotencyKey:`sale:${item.id}`},
      {eventType:'PLATFORM_COMMISSION' as const,amountMmk:-item.platformCommissionMmk,sourceId:item.id,idempotencyKey:`commission:${item.id}`}
    ];
    for(const entry of entries){const exists=await tx.vendorLedgerEntry.findUnique({where:{eventType_sourceType_sourceId:{eventType:entry.eventType,sourceType:'OrderItem',sourceId:entry.sourceId}}});if(!exists)await tx.vendorLedgerEntry.create({data:{vendorId:item.vendorId,earningId:earning.id,eventType:entry.eventType,amountMmk:entry.amountMmk,sourceType:'OrderItem',sourceId:entry.sourceId,idempotencyKey:entry.idempotencyKey,reason:`Verified marketplace order ${orderId}`}});}
  }
}
