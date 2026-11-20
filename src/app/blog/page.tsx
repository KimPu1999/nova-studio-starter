import Link from 'next/link';
import {ArrowUpRight,ChevronLeft,ChevronRight,Search} from 'lucide-react';
import {databaseConfigured,prisma} from '@/lib/prisma';

export const dynamic='force-dynamic';

type Props={searchParams:Promise<{q?:string;category?:string;page?:string}>};

export default async function Blog({searchParams}:Props){
  const params=await searchParams;
  const query=params.q?.trim()||'';
  const category=params.category?.trim()||'';
  const page=Math.max(1,Number(params.page)||1);
  const where={status:'PUBLISHED' as const,AND:[{OR:[{scheduledAt:null},{scheduledAt:{lte:new Date()}}]},...(query?[{OR:[{title:{contains:query,mode:'insensitive' as const}},{excerpt:{contains:query,mode:'insensitive' as const}}]}]:[]),...(category?[{category:{slug:category}}]:[])]};
  const [posts,categories,total]=databaseConfigured?await Promise.all([
    prisma.blogPost.findMany({where,include:{author:true,category:true,tags:{include:{tag:true}}},orderBy:{publishedAt:'desc'},skip:(page-1)*9,take:9}),
    prisma.blogCategory.findMany({orderBy:{name:'asc'}}),
    prisma.blogPost.count({where})
  ]):[[],[],0];
  const featured=page===1&&!query&&!category?posts[0]:undefined;
  const cards=featured?posts.slice(1):posts;
  const pageCount=Math.max(1,Math.ceil((total-(featured?1:0))/9));
  return <main className="blog-page">
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
      {cards.length?<><div className="blog-section-heading"><div><p className="eyebrow">LATEST ARTICLES</p><h2>Fresh from the studio</h2></div><span className="blog-count">{total} articles</span></div><div className="blog-grid">{cards.map(post=><Link href={`/blog/${post.slug}`} className="blog-card" key={post.id}><div className="blog-card-art">{post.featuredImageStorageKey?<img src={`/api/blog/image?key=${encodeURIComponent(post.featuredImageStorageKey)}`} alt=""/>:<span>{post.category?.name?.slice(0,1)||'N'}</span>}</div><div className="blog-card-body"><div className="blog-card-meta"><span>{post.category?.name||'Journal'}</span><time dateTime={post.publishedAt?.toISOString()}>{post.publishedAt?.toLocaleDateString()}</time></div><h3>{post.title}</h3><p>{post.excerpt}</p><div className="blog-card-footer"><span>{post.author.name}</span><span>{post.readingTimeMinutes} min read</span></div></div></Link>)}</div></>:<div className="blog-empty">No published articles match your search.</div>}
      {pageCount>1&&<nav className="blog-pagination" aria-label="Pagination"><Link className={page<=1?'disabled':''} href={page>1?`/blog?page=${page-1}`:'/blog'} aria-label="Previous page"><ChevronLeft size={16}/></Link><span>Page {page} of {pageCount}</span><Link className={page>=pageCount?'disabled':''} href={page<pageCount?`/blog?page=${page+1}`:`/blog?page=${page}`} aria-label="Next page"><ChevronRight size={16}/></Link></nav>}
    </div>
    <section className="container-wide blog-newsletter"><div><p className="eyebrow">STAY IN THE LOOP</p><h2>Useful ideas, occasionally.</h2><p>One thoughtful email when we publish something worth reading.</p></div><form><input type="email" required placeholder="you@example.com" aria-label="Email address"/><button className="btn-primary">Subscribe <ArrowUpRight size={16}/></button></form></section>
  </main>;
}
