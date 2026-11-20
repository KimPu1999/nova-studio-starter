import type {CSSProperties} from 'react';
import Link from 'next/link';
import {ArrowUpRight,ChevronLeft,ChevronRight,Clock,Search} from 'lucide-react';
import {databaseConfigured,prisma} from '@/lib/prisma';

export const dynamic='force-dynamic';

type Props={searchParams:Promise<{q?:string;category?:string;page?:string}>};
type PostDesign={cardBackground?:string;textColor?:string;accentColor?:string;featuredRatio?:string;imagePosition?:string;cardRadius?:string};

export default async function Blog({searchParams}:Props){
  const params=await searchParams;
  const query=params.q?.trim()||'';
  const category=params.category?.trim()||'';
  const page=Math.max(1,Number(params.page)||1);
  const where={status:'PUBLISHED' as const,AND:[{OR:[{scheduledAt:null},{scheduledAt:{lte:new Date()}}]},...(query?[{OR:[{title:{contains:query,mode:'insensitive' as const}},{excerpt:{contains:query,mode:'insensitive' as const}}]}]:[]),...(category?[{category:{slug:category}}]:[])]};
  const [posts,categories,total,settings]=databaseConfigured?await Promise.all([
    prisma.blogPost.findMany({where,include:{author:true,category:true,tags:{include:{tag:true}}},orderBy:{publishedAt:'desc'},skip:(page-1)*9,take:9}),
    prisma.blogCategory.findMany({orderBy:{name:'asc'}}),
    prisma.blogPost.count({where}),
    prisma.siteSetting.findMany({where:{key:{startsWith:'blogDesign.'}}})
  ]):[[],[],0,[]];
  const setting=(key:string,fallback:string)=>settings.find(row=>row.key===`blogDesign.${key}`)?.value||fallback;
  const pageStyle={'--blog-bg':setting('blogBackground','#09090f'),'--blog-accent':setting('accentColor','#8b5cf6'),'--blog-columns':setting('gridColumns','3')} as CSSProperties;
  const featured=page===1&&!query&&!category?posts[0]:undefined;
  const cards=featured?posts.slice(1):posts;
  const pageCount=Math.max(1,Math.ceil((total-(featured?1:0))/9));
  return <main className="blog-page" style={pageStyle}>
    <section className="blog-hero container-wide">
      <div><p className="eyebrow">NOVA JOURNAL</p><h1>Ideas for the <span className="gradient-text">web.</span></h1><p>Thoughtful notes on design, development, and building digital products people remember.</p></div>
      <div className="blog-hero-mark" aria-hidden="true">✳</div>
    </section>
    <section className="container-wide blog-toolbar" aria-label="Blog filters">
      <form className="blog-search"><Search size={17}/><input name="q" defaultValue={query} placeholder="Search articles…"/><button type="submit" className="sr-only">Search</button></form>
      <nav className="blog-categories"><Link className={!category?'active':''} href="/blog">All</Link>{categories.map(c=><Link className={category===c.slug?'active':''} href={`/blog?category=${c.slug}`} key={c.id}>{c.name}</Link>)}</nav>
    </section>
    <div className="container-wide">
      {featured&&<Link href={`/blog/${featured.slug}`} className="blog-featured"><div className="blog-featured-copy"><span className="blog-badge">{featured.category?.name||'Featured'}</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><span className="blog-read-link">Read article <ArrowUpRight size={16}/></span></div><div className="blog-featured-art" aria-hidden="true">{featured.featuredImageStorageKey?<img src={`/api/blog/image?key=${encodeURIComponent(featured.featuredImageStorageKey)}`} alt=""/>:<span>✦</span>}</div></Link>}
      {cards.length?<><div className="blog-section-heading"><div><p className="eyebrow">LATEST ARTICLES</p><h2>Fresh from the studio</h2></div><span className="blog-count">{total} articles</span></div><div className="blog-grid">{cards.map(post=>{const design=(post.content as {design?:PostDesign}).design||{};const cardStyle={'--post-card-bg':/^#[0-9a-f]{6}$/i.test(design.cardBackground||'')?design.cardBackground:'#151520','--post-text':/^#[0-9a-f]{6}$/i.test(design.textColor||'')?design.textColor:'#ffffff','--post-accent':/^#[0-9a-f]{6}$/i.test(design.accentColor||'')?design.accentColor:'#c4b5fd','--post-ratio':['16/9','4/3','1/1','3/2'].includes(design.featuredRatio||'')?design.featuredRatio:'16/9','--post-position':['center','top','bottom','left','right'].includes(design.imagePosition||'')?design.imagePosition:'center','--post-radius':['8','14','18','24'].includes(design.cardRadius||'')?`${design.cardRadius}px`:'18px'} as CSSProperties;return <Link href={`/blog/${post.slug}`} className="blog-card" key={post.id} style={cardStyle}><div className="blog-card-art">{post.featuredImageStorageKey?<img src={`/api/blog/image?key=${encodeURIComponent(post.featuredImageStorageKey)}`} alt=""/>:<span>{post.category?.name?.slice(0,1)||'N'}</span>}</div><div className="blog-card-body"><div className="blog-card-meta blog-card-author-row"><span className="blog-card-author"><span className="blog-author-avatar" aria-hidden="true">{post.author.name.slice(0,1).toUpperCase()}</span>{post.author.name}</span><span className="blog-card-reading"><Clock size={14} aria-hidden="true"/>{post.readingTimeMinutes} min read</span></div><h3>{post.title}</h3><p>{post.excerpt}</p><span className="blog-card-read">Read more <ArrowUpRight size={15} aria-hidden="true"/></span></div></Link>})}</div></>:<div className="blog-empty">No published articles match your search.</div>}
      {pageCount>1&&<nav className="blog-pagination" aria-label="Pagination"><Link className={page<=1?'disabled':''} href={page>1?`/blog?page=${page-1}`:'/blog'} aria-label="Previous page"><ChevronLeft size={16}/></Link><span>Page {page} of {pageCount}</span><Link className={page>=pageCount?'disabled':''} href={page<pageCount?`/blog?page=${page+1}`:`/blog?page=${page}`} aria-label="Next page"><ChevronRight size={16}/></Link></nav>}
    </div>
    <section className="container-wide blog-newsletter"><div><p className="eyebrow">STAY IN THE LOOP</p><h2>Useful ideas, occasionally.</h2><p>Want the next note when it ships? Get in touch with the studio.</p></div><Link href="/contact" className="btn-primary">Contact the studio <ArrowUpRight size={16}/></Link></section>
  </main>;
}
