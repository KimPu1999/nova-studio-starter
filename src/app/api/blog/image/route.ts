import {NextRequest,NextResponse} from 'next/server';
import {getPrivateFile} from '@/lib/private-storage';
import {prisma,databaseConfigured} from '@/lib/prisma';
export async function GET(request:NextRequest){const key=request.nextUrl.searchParams.get('key')||'';if(!databaseConfigured||!key)return new NextResponse('Not found',{status:404});const post=await prisma.blogPost.findFirst({where:{featuredImageStorageKey:key,status:'PUBLISHED'}});if(!post)return new NextResponse('Not found',{status:404});try{const bytes=await getPrivateFile(key);const type=key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg';return new NextResponse(bytes,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600'}})}catch{return new NextResponse('Not found',{status:404})}}
