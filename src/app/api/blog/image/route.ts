import {NextRequest,NextResponse} from 'next/server';
import {getPrivateFile} from '@/lib/private-storage';
import {prisma,databaseConfigured} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';

export async function GET(request:NextRequest){
  const key=request.nextUrl.searchParams.get('key')||'';
  const previewPostId=request.nextUrl.searchParams.get('postId')||'';
  if(!databaseConfigured||!key)return new NextResponse('Not found',{status:404});
  const posts=await prisma.blogPost.findMany({where:previewPostId?{id:previewPostId}:{status:'PUBLISHED',OR:[{scheduledAt:null},{scheduledAt:{lte:new Date()}}]},select:{id: true,status:true,featuredImageStorageKey:true,content:true}});
  const post=posts.find(item=>item.featuredImageStorageKey===key||JSON.stringify(item.content).includes(key));
  if(!post)return new NextResponse('Not found',{status:404});
  if(post.status!=='PUBLISHED'){const user=await currentUser();if(!user||!['SUPER_ADMIN','ADMIN','EDITOR'].includes(user.role.code))return new NextResponse('Not found',{status:404});}
  try{const bytes=await getPrivateFile(key);const type=key.endsWith('.png')?'image/png':key.endsWith('.webp')?'image/webp':'image/jpeg';return new NextResponse(bytes,{headers:{'Content-Type':type,'Cache-Control':post.status==='PUBLISHED'?'public, max-age=3600':'private, no-store'}})}catch{return new NextResponse('Not found',{status:404})}
}
