import Link from 'next/link';
import {requireUser} from '@/lib/auth';
import {ProjectRequestForm} from './form';

export const dynamic='force-dynamic';

export default async function RequestProject({searchParams}:{searchParams:Promise<{service?:string;request?:string}>}){
  await requireUser();
  const p=await searchParams;
  return <main className="project-page"><div className="project-shell">
    <Link href="/services" className="project-back">← Services</Link>
    <div className="project-hero"><p className="project-eyebrow">START A PROJECT</p><h1>Tell us what you’re <span className="gradient-text">building.</span></h1><p>Share a few details and we’ll help shape the right digital experience for your goals.</p></div>
    {p.request?<div className="project-success"><p className="project-eyebrow">REQUEST RECEIVED</p><h2>Your brief is with the studio.</h2><p>Request <strong>{p.request}</strong> has been saved. We’ll review it and follow up in your account workspace.</p><Link href="/account/projects" className="btn-primary mt-6 inline-flex">View projects</Link></div>:<ProjectRequestForm serviceId={p.service}/>} 
  </div></main>;
}
