import {prisma} from './prisma';
export async function getCart(userId:string){return prisma.cart.findUnique({where:{userId},include:{items:{include:{template:{include:{category:true}}},orderBy:{createdAt:'asc'}}}})}
export async function getOrCreateCart(userId:string){return prisma.cart.upsert({where:{userId},update:{},create:{userId},include:{items:true}})}
