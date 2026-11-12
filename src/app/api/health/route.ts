import {NextResponse} from 'next/server';
import {prisma,databaseConfigured} from '@/lib/prisma';
export const dynamic='force-dynamic';
export async function GET(){if(!databaseConfigured)return NextResponse.json({status:'degraded'}, {status:503,headers:{'Cache-Control':'no-store'}});try{await prisma.$queryRaw`SELECT 1`;return NextResponse.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({status:'degraded'},{status:503,headers:{'Cache-Control':'no-store'}});}}
