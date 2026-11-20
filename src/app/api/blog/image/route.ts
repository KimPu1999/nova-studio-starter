import {NextRequest,NextResponse} from 'next/server';
import {getPrivateFile} from '@/lib/private-storage';
import {prisma,databaseConfigured} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';

export async function GET(request:NextRequest){
  const key=request.nextUrl.searchParams.get('key')||'';
  const previewPostId=request.nextUrl.searchParams.get('postId')||'';
  if(!databaseConfigured||!key)return new NextResponse('Not found',{status:404});
  const publishedWhere={status:'PUBLISHED' as const,OR:[{scheduledAt:null},{scheduledAt:{lte:new Date()}}]};
  const post=previewPostId?await prisma.blogPost.findUnique({where:{id:previewPostId},select:{id:true,status:true,featuredImageStorageKey:true,content:true}}):await prisma.blogPost.findFirst({where:{...publishedWhere,featuredImageStorageKey:key},select:{id:true,status:true,featuredImageStorageKey:true,content:true}});
  const inlinePost=post??(previewPostId?null:((await prisma.blogPost.findMany({where:publishedWhere,select:{id:true,status:true,featuredImageStorageKey:true,content:true}})).find(item=>JSON.stringify(item.content).includes(key))||null));
  if(!inlinePost)return new NextResponse('Not found',{status:404});
  if(inlinePost.status!=='PUBLISHED'){const user=await currentUser();if(!user||!['SUPER_ADMIN','ADMIN','EDITOR'].includes(user.role.code))return new NextResponse('Not found',{status:404});}
  try{const bytes=await getPrivateFile(key);const type=key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg';return new NextResponse(bytes,{headers:{'Content-Type':type,'Cache-Control':inlinePost.status==='PUBLISHED'?'public, max-age=3600, stale-while-revalidate=86400':'private, no-store'}})}catch{return new NextResponse('Not found',{status:404})}
}
