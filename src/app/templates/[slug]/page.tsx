import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {ArrowLeft,ArrowUpRight,Check,Clock3,ExternalLink,LockKeyhole,Star} from 'lucide-react';
import {getPublishedProduct,getPublishedProducts} from '@/lib/catalog';
import {prisma,databaseConfigured} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';
import {getGuestId} from '@/lib/cart';
import {PurchaseActions} from './purchase-actions';

type Props={params:Promise<{slug:string}>};
export const dynamic='force-dynamic';
export async function generateMetadata({params}:Props):Promise<Metadata>{const {slug}=await params;const product=await getPublishedProduct(slug);return {title:product?.name??'Template',description:product?.description};}

export default async function Detail({params}:Props){
  const {slug}=await params;
  const p=await getPublishedProduct(slug);
  if(!p)notFound();
  const dbTemplate=databaseConfigured?await prisma.template.findUnique({where:{slug,status:'PUBLISHED'},include:{category:true,detail:true,features:{orderBy:{sortOrder:'asc'}},screenshots:{orderBy:{sortOrder:'asc'}},images:{orderBy:{sortOrder:'asc'}},documentation:{select:{isPublished:true,accessLevel:true}},pdfFiles:{where:{isVisible:true},select:{id:true,accessLevel:true}},designSettings:true,licensePrices:{where:{isActive:true,licenseType:{isActive:true}},include:{licenseType:true},orderBy:{priceMmk:'asc'}},versions:{where:{status:'PUBLISHED'},include:{files:true},orderBy:{releaseDate:'desc'}},reviews:{where:{status:'ACTIVE'},include:{customer:true},orderBy:{createdAt:'desc'},take:10}}}):null;
  const user=await currentUser();
  const guestId=user?null:await getGuestId(false);
  const wished=dbTemplate?await prisma.wishlistItem.findFirst({where:{productId:dbTemplate.id,...(user?{customerId:user.id}:guestId?{guestId}:{id:'00000000-0000-0000-0000-000000000000'})}}):null;
  const related=databaseConfigured?await getPublishedProducts():[];
  const relatedTemplates=related.filter(item=>item.slug!==p.slug).slice(0,3);
  const reviews=dbTemplate?.reviews||[];
  const average=reviews.length?reviews.reduce((sum,review)=>sum+review.rating,0)/reviews.length:0;
  const imageUrl=dbTemplate?.images[0]?.url||dbTemplate?.thumbnailUrl||p.thumbnailUrl||null;
  const featureLabels=dbTemplate?.features.length?dbTemplate.features.map(feature=>feature.label):p.features;
  const settings=dbTemplate?.designSettings;
  const pageStyle={'--template-page-bg':settings?.pageBackground||'#0B0D14','--template-card-bg':settings?.cardBackground||'#151722','--template-accent':settings?.accentColor||'#7967F4','--template-heading':settings?.headingColor||'#F8F9FC','--template-body':settings?.bodyColor||'#A6A7BA','--template-content-width':settings?.contentWidth||'1180px','--template-radius':settings?.borderRadius||'24px'} as React.CSSProperties;
  const docsAvailable=Boolean(settings?.showDocumentation!==false&&(dbTemplate?.documentation?.isPublished||dbTemplate?.pdfFiles.length));
  return <main className="template-detail-page page-pad" style={pageStyle}>
    <div className="template-detail-container container-wide">
      <Link href="/templates" className="template-detail-back"><ArrowLeft size={16}/> All templates</Link>
      <div className="template-detail-hero">
        <div className="template-detail-gallery">
          <div className="template-detail-cover">{imageUrl?<img src={imageUrl} alt={p.name+' featured image'}/>:<div className={'product-art relative flex h-full items-center justify-center rounded-3xl bg-gradient-to-br '+p.gradient}><div className="art-grid"/><div className="mock-browser scale-125"><div className="mock-dots"><i/><i/><i/></div><div className="mock-layout"><div className="mock-bar"/><div className="mock-title"/><div className="mock-line"/><div className="mock-tiles"><i/><i/><i/></div></div></div></div>}</div>
          {(dbTemplate?.screenshots.length||dbTemplate?.images.length)&&settings?.showScreenshots!==false?<div className="template-detail-screenshots">{dbTemplate?.screenshots.map(screenshot=><img key={screenshot.id} src={'/api/templates/'+dbTemplate.id+'/screenshots/'+screenshot.id} alt={screenshot.altText||p.name+' screenshot'}/>)}{dbTemplate?.images.map(image=><img key={image.id} src={image.url} alt={image.altText||p.name+' screenshot'}/>)}</div>:null}
        </div>
        <aside className="template-detail-purchase panel">
          <span className="eyebrow">{p.category}</span>
          <h1>{p.name}</h1>
          <p className="template-detail-short-description">{p.description}</p>
          <div className="template-detail-stack">{p.stack.map(item=><span className="tech-pill" key={item}>{item}</span>)}</div>
          <div className="template-detail-availability"><span/> Available for purchase</div>
          {dbTemplate?.licensePrices.length?<PurchaseActions templateId={dbTemplate.id} slug={p.slug} licenses={dbTemplate.licensePrices.map(price=>({licenseTypeId:price.licenseTypeId,name:price.licenseType.name,priceMmk:price.priceMmk,licenseTerms:price.licenseTerms,allowedUsage:price.allowedUsage}))} initialWishlisted={Boolean(wished)}/>:<Link href="/contact" className="btn-primary mt-6 flex w-full justify-center">Ask about this template</Link>}
          {p.demoUrl&&<a className="template-detail-preview" href={p.demoUrl} target="_blank" rel="noreferrer"><ExternalLink size={16}/> Live preview</a>}
          <div className="template-detail-payment-note"><LockKeyhole size={17}/><span>Manual payment verification is required before downloads and licenses are enabled.</span></div>
        </aside>
      </div>

      <div className="template-detail-body">
        <div className="template-detail-main">
          <section className="template-detail-section"><p className="eyebrow">THE PROJECT</p><h2>Built to move your next idea forward.</h2><p className="template-detail-long-copy">{dbTemplate?.detail?.fullDescription||p.description}</p></section>
          <section className="template-detail-section"><p className="eyebrow">WHAT’S INCLUDED</p><h2>Everything you need to launch.</h2><div className="template-detail-features">{featureLabels.map(feature=><div key={feature}><Check size={17}/><span>{feature}</span></div>)}</div></section>
          {dbTemplate?.detail?.requirements.length?<section className="template-detail-section"><p className="eyebrow">REQUIREMENTS</p><h2>Before you begin.</h2><ul className="template-detail-requirements">{dbTemplate.detail.requirements.map(requirement=><li key={requirement}>{requirement}</li>)}</ul></section>:null}
          {docsAvailable&&<section className="template-detail-docs-cta"><div><p className="eyebrow">DOCUMENTATION</p><h2>Get from first install to first launch.</h2><p>Read the saved setup guide, configuration notes, usage examples, and reference files.</p></div><Link className="btn-outline" href={'/templates/'+p.slug+'/docs'}>Open documentation <ArrowUpRight size={16}/></Link></section>}
          {dbTemplate?.versions.length?<section className="template-detail-section"><div className="template-detail-section-heading"><div><p className="eyebrow">RELEASES</p><h2>Version history</h2></div><span className="template-detail-muted">Latest v{dbTemplate.versions[0].versionNumber}</span></div><div className="template-detail-versions">{dbTemplate.versions.map(version=><article key={version.id}><div><strong>v{version.versionNumber}</strong><span>{version.releaseDate.toLocaleDateString()}</span></div><p>{version.changelog}</p></article>)}</div></section>:null}
          {reviews.length?<section className="template-detail-section"><div className="template-detail-section-heading"><div><p className="eyebrow">CUSTOMER NOTES</p><h2>Reviews</h2></div><span className="template-detail-muted"><Star size={14}/> {average.toFixed(1)}</span></div><div className="template-detail-reviews">{reviews.map(review=><article key={review.id}><div><strong>{review.title}</strong><span className="text-amber-200">{'★'.repeat(review.rating)}</span></div><p>{review.content}</p><small>Verified purchase · {review.customer.name}</small></article>)}</div></section>:null}
        </div>
        <aside className="template-detail-meta">
          <div><span>Category</span><strong>{p.category}</strong></div>
          <div><span>Technology</span><strong>{p.stack.join(' · ')}</strong></div>
          <div><span>Version</span><strong>{dbTemplate?.detail?.version||dbTemplate?.versions[0]?.versionNumber||'Latest release'}</strong></div>
          <div><span>Release date</span><strong>{dbTemplate?.detail?.releaseDate?.toLocaleDateString()||'Regular updates'}</strong></div>
          {docsAvailable&&<Link className="template-detail-meta-link" href={'/templates/'+p.slug+'/docs'}>Documentation <ArrowUpRight size={15}/></Link>}
        </aside>
      </div>

      {relatedTemplates.length?<section className="template-related"><div className="template-detail-section-heading"><div><p className="eyebrow">KEEP EXPLORING</p><h2>Related templates</h2></div><Link className="text-link" href="/templates">View all <ArrowUpRight size={15}/></Link></div><div className="template-related-grid">{relatedTemplates.map(item=><Link className="template-related-card" href={'/templates/'+item.slug} key={item.slug}>{item.thumbnailUrl?<img src={item.thumbnailUrl} alt={item.name}/>:<div className="template-related-art"/>}<span>{item.category}</span><strong>{item.name}</strong><p>{item.description}</p></Link>)}</div></section>:null}
    </div>
  </main>;
}
