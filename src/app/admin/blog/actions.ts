'use server';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {BlogPostStatus,RoleCode} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {blogPostSchema} from '@/lib/validation';
import {csrfCheck,requireCmsEditor} from '@/lib/auth';
import {putPrivateFile} from '@/lib/private-storage';

const text=(formData:FormData,key:string)=>String(formData.get(key)||'');
const editorRoles=[RoleCode.SUPER_ADMIN,RoleCode.ADMIN,RoleCode.EDITOR];
const validColor=(value:string,fallback:string)=>/^#[0-9a-f]{6}$/i.test(value)?value:fallback;
const safeExtension=(type:string)=>type==='image/png'?'png':type==='image/webp'?'webp':'jpg';

function parseBlocks(value:string){
  return value.split(/\n\s*\n/).map(part=>part.trim()).filter(Boolean).map(part=>{
    const image=part.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\n_([^_]+)_)?$/);
    if(image&&(/^(https?:\/\/|\/api\/blog\/image\?key=)/.test(image[2])))return {type:'image',alt:image[1],src:image[2],caption:image[3]||undefined};
    const video=part.match(/^@\[video\]\((https?:\/\/[^)]+)\)$/);
    if(video)return {type:'video',src:video[1]};
    if(part.startsWith('```'))return {type:'code',text:part.replace(/^```\w*\n?/,'').replace(/```$/,'')};
    if(part.startsWith('> '))return {type:'quote',text:part.slice(2)};
    const heading=part.match(/^(#{2,4})\s+(.+)$/);
    if(heading)return {type:'heading',level:heading[1].length,text:heading[2]};
    if(part.split('\n').every(line=>line.startsWith('- ')))return {type:'list',items:part.split('\n').map(line=>line.slice(2))};
    return {type:'paragraph',text:part};
  });
}

async function uploadImage(file:File,maxBytes:number){
  if(file.size>maxBytes||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Images must be PNG, JPG, or WebP within the allowed size.');
  const bytes=Buffer.from(await file.arrayBuffer());
  const valid=file.type==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':file.type==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8:bytes.subarray(0,4).toString('hex')==='52494646';
  if(!valid)throw new Error('Uploaded image signature is invalid.');
  return putPrivateFile(bytes,safeExtension(file.type));
}

const revalidate=(slug?:string)=>{revalidatePath('/blog');revalidatePath('/admin/blog');revalidatePath('/admin/blog/posts');if(slug)revalidatePath(`/blog/${slug}`)};

export async function savePost(formData:FormData){
  const user=await requireCmsEditor();
  await csrfCheck();
  const contentText=text(formData,'content');
  const parsed=blogPostSchema.safeParse({slug:text(formData,'slug'),title:text(formData,'title'),excerpt:text(formData,'excerpt'),content:contentText,status:text(formData,'status')||'DRAFT',seoTitle:text(formData,'seoTitle'),seoDescription:text(formData,'seoDescription'),scheduledAt:text(formData,'scheduledAt')||undefined});
  if(!parsed.success)throw new Error('Please check the post fields.');
  const id=text(formData,'id');
  const existing=id?await prisma.blogPost.findUnique({where:{id}}):null;
  const requestedAuthor=text(formData,'authorId');
  const selectedAuthor=requestedAuthor?await prisma.user.findFirst({where:{id:requestedAuthor,role:{code:{in:editorRoles}}},select:{id:true}}):null;
  const authorId=selectedAuthor?.id||user.id;
  const scheduledAt=parsed.data.scheduledAt?new Date(parsed.data.scheduledAt):null;
  const status=parsed.data.status as BlogPostStatus;
  let featuredImageStorageKey=existing?.featuredImageStorageKey||null;
  const featured=formData.get('featuredImage');
  if(featured instanceof File&&featured.size)featuredImageStorageKey=await uploadImage(featured,5*1024*1024);
  const uploadedBlocks=[];
  for(const file of formData.getAll('articleImages'))if(file instanceof File&&file.size){const key=await uploadImage(file,10*1024*1024);uploadedBlocks.push({type:'image',src:`/api/blog/image?key=${encodeURIComponent(key)}&postId=__POST_ID__`,alt:file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')});}
  const checked=(key:string,defaultValue:boolean)=>{const values=formData.getAll(key).map(String);return values.length?values.includes('true'):defaultValue};
  const design={
    layout:['standard','full-width','sidebar','minimal','magazine'].includes(text(formData,'layout'))?text(formData,'layout'):'standard',
    accentColor:validColor(text(formData,'accentColor'),'#8b5cf6'),cardBackground:validColor(text(formData,'cardBackground'),'#151520'),textColor:validColor(text(formData,'textColor'),'#ffffff'),articleBackground:validColor(text(formData,'articleBackground'),'#09090f'),
    featuredRatio:['16/9','4/3','1/1','3/2'].includes(text(formData,'featuredRatio'))?text(formData,'featuredRatio'):'16/9',imagePosition:['center','top','bottom','left','right'].includes(text(formData,'imagePosition'))?text(formData,'imagePosition'):'center',cardRadius:['8','14','18','24'].includes(text(formData,'cardRadius'))?text(formData,'cardRadius'):'18',contentWidth:['680','760','900','1100'].includes(text(formData,'contentWidth'))?text(formData,'contentWidth'):'760',imageWidth:['75','90','100'].includes(text(formData,'imageWidth'))?text(formData,'imageWidth'):'100',bodyFontSize:['1','1.05','1.125'].includes(text(formData,'bodyFontSize'))?text(formData,'bodyFontSize'):'1.05',headingSize:['1.75','2','2.35'].includes(text(formData,'headingSize'))?text(formData,'headingSize'):'2',
    showAuthor:checked('showAuthor',true),showDate:checked('showDate',true),showReadingTime:checked('showReadingTime',true),showToc:checked('showToc',false),showRelated:checked('showRelated',true),showNewsletter:checked('showNewsletter',true)
  };
  const parsedBlocks=[...parseBlocks(contentText),...uploadedBlocks];
  const data={slug:parsed.data.slug,title:parsed.data.title,excerpt:parsed.data.excerpt,content:{blocks:parsedBlocks,design},status,categoryId:text(formData,'categoryId')||null,authorId,seoTitle:parsed.data.seoTitle||null,seoDescription:parsed.data.seoDescription||null,canonicalUrl:text(formData,'canonicalUrl')||null,featuredImageStorageKey,scheduledAt,publishedAt:status==='PUBLISHED'&&!scheduledAt?(existing?.publishedAt||new Date()):null,readingTimeMinutes:Math.max(1,Math.ceil(contentText.split(/\s+/).filter(Boolean).length/200))};
  const post=existing?await prisma.blogPost.update({where:{id},data}):await prisma.blogPost.create({data});
  if(uploadedBlocks.length){const finalBlocks=parsedBlocks.map(block=>({...block,src:typeof block.src==='string'?block.src.replace('__POST_ID__',post.id):block.src}));await prisma.blogPost.update({where:{id:post.id},data:{content:{blocks:finalBlocks,design} as never}});}
  const tagNames=[...new Set(text(formData,'tags').split(',').map(x=>x.trim()).filter(Boolean).slice(0,20))];
  await prisma.blogPostTag.deleteMany({where:{postId:post.id}});
  for(const name of tagNames){const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!slug)continue;const tag=await prisma.blogTag.upsert({where:{slug},update:{name},create:{name,slug}});await prisma.blogPostTag.create({data:{postId:post.id,tagId:tag.id}})}
  revalidate(post.slug);redirect(`/admin/blog/posts/${post.id}/edit`);
}

export async function deletePost(formData:FormData){await requireCmsEditor();await csrfCheck();const id=text(formData,'id');await prisma.blogPost.delete({where:{id}});revalidate();redirect('/admin/blog/posts');}
export async function duplicatePost(formData:FormData){const user=await requireCmsEditor();await csrfCheck();const id=text(formData,'id');const source=await prisma.blogPost.findUnique({where:{id},include:{tags:true}});if(!source)throw new Error('Post not found.');const slug=`${source.slug}-copy-${Date.now().toString(36)}`;const copy=await prisma.blogPost.create({data:{slug,title:`${source.title} (Copy)`,excerpt:source.excerpt,content:source.content as never,status:'DRAFT',categoryId:source.categoryId,authorId:user.id,seoTitle:source.seoTitle,seoDescription:source.seoDescription,canonicalUrl:null,featuredImageStorageKey:source.featuredImageStorageKey,readingTimeMinutes:source.readingTimeMinutes,tags:{create:source.tags.map(({tagId})=>({tagId}))}}});revalidate();redirect(`/admin/blog/posts/${copy.id}/edit`);}

export async function saveCategory(formData:FormData){await requireCmsEditor();await csrfCheck();const id=text(formData,'id');const name=text(formData,'name').trim();const slug=text(formData,'slug').trim();if(name.length<2||slug.length<2||!/^[a-z0-9-]+$/.test(slug))throw new Error('Enter a valid category.');if(id)await prisma.blogCategory.update({where:{id},data:{name,slug}});else await prisma.blogCategory.create({data:{name,slug}});revalidate();}
export async function deleteCategory(formData:FormData){await requireCmsEditor();await csrfCheck();await prisma.blogCategory.delete({where:{id:text(formData,'id')}});revalidate();}
export async function saveTag(formData:FormData){await requireCmsEditor();await csrfCheck();const id=text(formData,'id');const name=text(formData,'name').trim();const slug=text(formData,'slug').trim();if(name.length<2||slug.length<2||!/^[a-z0-9-]+$/.test(slug))throw new Error('Enter a valid tag.');if(id)await prisma.blogTag.update({where:{id},data:{name,slug}});else await prisma.blogTag.create({data:{name,slug}});revalidate();}
export async function deleteTag(formData:FormData){await requireCmsEditor();await csrfCheck();await prisma.blogTag.delete({where:{id:text(formData,'id')}});revalidate();}
export async function saveBlogDesign(formData:FormData){await requireCmsEditor();await csrfCheck();const values={blogBackground:text(formData,'blogBackground')||'#09090f',accentColor:text(formData,'accentColor')||'#8b5cf6',gridColumns:text(formData,'gridColumns')||'3',articleMaxWidth:text(formData,'articleMaxWidth')||'760',cardStyle:text(formData,'cardStyle')||'bordered',newsletterEnabled:text(formData,'newsletterEnabled')==='true'};for(const [key,value] of Object.entries(values))await prisma.siteSetting.upsert({where:{key:`blogDesign.${key}`},update:{value:String(value)},create:{key:`blogDesign.${key}`,value:String(value)}});revalidatePath('/admin/blog/design');revalidatePath('/blog');}
