import Link from 'next/link';
import type {Metadata} from 'next';
import {ArrowLeft,Check,Clock3,ShieldCheck} from 'lucide-react';
import {notFound} from 'next/navigation';
import {databaseConfigured,prisma} from '@/lib/prisma';

export const dynamic='force-dynamic';

export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata>{
  const {slug}=await params;
  if(!databaseConfigured)return {title:'Service'};
  const service=await prisma.service.findFirst({where:{slug,status:'PUBLISHED'},select:{name:true,description:true}});
  return service?{title:service.name,description:service.description}:{title:'Service'};
}

type FaqItem={question?:string;answer?:string};

export default async function ServiceDetail({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  if(!databaseConfigured)notFound();

  const service=await prisma.service.findFirst({where:{slug,status:'PUBLISHED'}});
  if(!service)notFound();

  const faq=Array.isArray(service.faq)?service.faq as FaqItem[]:[];
  return <main className="service-detail-page page-pad">
    <div className="service-detail-container container-wide">
      <nav className="service-detail-breadcrumb" aria-label="Breadcrumb">
        <Link href="/services" className="service-detail-back"><ArrowLeft size={16}/> <span>Services</span></Link>
        <span className="service-detail-breadcrumb-divider" aria-hidden="true">/</span>
        <span>{service.category}</span>
      </nav>

      <header className="service-detail-hero">
        <span className="eyebrow">{service.category}</span>
        <h1 className="service-detail-title">{service.name}</h1>
        <p className="service-detail-description">{service.description}</p>
      </header>

      <div className="service-detail-grid">
        <section className="service-detail-content" aria-labelledby="included-title">
          <div className="service-detail-section-heading">
            <span className="service-detail-step">01</span>
            <div>
              <p className="service-detail-kicker">THE SCOPE</p>
              <h2 id="included-title" className="service-detail-section-title">What’s included</h2>
            </div>
          </div>

          <ul className="service-detail-feature-list">
            {service.includedFeatures.map(feature=><li key={feature} className="service-detail-feature">
              <span className="service-detail-feature-icon"><Check size={16}/></span>
              <span>{feature}</span>
            </li>)}
          </ul>

          {faq.length>0&&<section className="service-detail-faq" aria-labelledby="faq-title">
            <p className="service-detail-kicker">GOOD TO KNOW</p>
            <h2 id="faq-title" className="service-detail-section-title">Frequently asked questions</h2>
            <div className="service-detail-faq-list">
              {faq.map((item,index)=><div key={`${item.question||'faq'}-${index}`} className="service-detail-faq-item">
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>)}
            </div>
          </section>}
        </section>

        <aside className="service-detail-quote" aria-label="Service estimate">
          <p className="service-detail-quote-label">STARTING FROM</p>
          <p className="service-detail-quote-price">{service.startingPriceMmk!==null&&service.startingPriceMmk!==undefined?`${service.startingPriceMmk.toLocaleString()} MMK`:'Custom quote'}</p>
          {service.estimatedDeliveryDays&&<div className="service-detail-delivery"><Clock3 size={17}/><span>Estimated delivery: <strong>{service.estimatedDeliveryDays} days</strong></span></div>}
          <Link href={`/request-project?service=${service.id}`} className="btn-primary service-detail-cta">{service.ctaText||'Request a consultation'} <ArrowLeft size={17} className="service-detail-cta-arrow"/></Link>
          <div className="service-detail-quote-divider"/>
          <div className="service-detail-next">
            <p className="service-detail-kicker">WHAT HAPPENS NEXT</p>
            <div><span>01</span><p>Share your goals and project details.</p></div>
            <div><span>02</span><p>We’ll shape the right approach together.</p></div>
            <div><span>03</span><p>Receive a clear proposal and timeline.</p></div>
          </div>
          <div className="service-detail-trust"><ShieldCheck size={17}/><span>Thoughtful work, clear communication.</span></div>
        </aside>
      </div>
    </div>
  </main>;
}
