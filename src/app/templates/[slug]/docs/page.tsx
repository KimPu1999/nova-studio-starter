import Link from 'next/link';
import {ArrowLeft,LockKeyhole} from 'lucide-react';
import {notFound} from 'next/navigation';
import {databaseConfigured,prisma} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';
import {canAccessTemplateLevel,canAccessTemplatePdf} from '@/lib/template-access';
import {DocumentationContent,DocumentationSidebar} from '@/components/template-documentation';

export const dynamic='force-dynamic';

export default async function TemplateDocs({params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  if(!databaseConfigured)notFound();
  const template=await prisma.template.findUnique({where:{slug,status:'PUBLISHED'},include:{category:true,documentation:{include:{sections:{orderBy:{sortOrder:'asc'}},},},pdfFiles:{where:{isVisible:true},orderBy:{sortOrder:'asc'}},designSettings:true}});
  if(!template)notFound();
  if(!template.documentation||!template.documentation.isPublished)return <main className="template-docs-page page-pad"><div className="container-wide"><Link href={'/templates/'+template.slug} className="template-docs-back"><ArrowLeft size={16}/> Back to {template.name}</Link><header className="template-docs-header"><p className="eyebrow">{template.category.name} · DOCUMENTATION</p><h1>{template.name} documentation</h1><p>Documentation has not been published for this template yet.</p></header><div className="template-cms-empty template-docs-empty-state">The documentation team is preparing the setup guide and reference files.</div></div></main>;
  const user=await currentUser();
  const allowed=await canAccessTemplateLevel(template.id,template.documentation.accessLevel,user);
  const sections=template.documentation.sections;
  const allowedPdfs=await Promise.all(template.pdfFiles.map(async pdf=>({pdf,allowed:await canAccessTemplatePdf(template.id,pdf.accessLevel,user)})));
  return <main className="template-docs-page page-pad" style={{'--template-accent':template.designSettings?.accentColor||'#7967F4','--template-card':template.designSettings?.cardBackground||'#151722'} as React.CSSProperties}>
    <div className="container-wide">
      <Link href={'/templates/'+template.slug} className="template-docs-back"><ArrowLeft size={16}/> Back to {template.name}</Link>
      <header className="template-docs-header"><p className="eyebrow">{template.category.name} · DOCUMENTATION</p><h1>{template.name} documentation</h1><p>Installation, configuration, usage notes, and release documents for this template.</p></header>
      {!allowed?<section className="template-docs-locked"><LockKeyhole size={22}/><div><h2>Documentation access is restricted</h2><p>{template.documentation.accessLevel==='PURCHASER'?'Purchase this template and sign in to unlock the documentation.':'Sign in to read this documentation.'}</p><Link className="btn-primary" href={template.documentation.accessLevel==='PURCHASER'?'/templates/'+template.slug:'/login'}>{template.documentation.accessLevel==='PURCHASER'?'View template':'Sign in'}</Link></div></section>:<div className="template-docs-layout"><DocumentationSidebar sections={sections} slug={template.slug}/><div className="template-docs-content">{sections.length?sections.map(section=><article className="template-doc-section" id={section.slug} key={section.id}><p className="template-doc-section-number">{String(section.sortOrder+1).padStart(2,'0')}</p><h2>{section.title}</h2><DocumentationContent content={section.content}/></article>):<div className="template-cms-empty">Documentation is being prepared.</div>}<section className="template-doc-pdfs"><p className="eyebrow">REFERENCE FILES</p><h2>PDF documents</h2><div className="template-doc-pdf-list">{allowedPdfs.length?allowedPdfs.map(({pdf,allowed:pdfAllowed})=><div className="template-doc-pdf-card" key={pdf.id}><div><strong>{pdf.title}</strong><span>{pdf.description||pdf.originalFileName}{pdf.version?' · v'+pdf.version:''}</span></div>{pdfAllowed?<Link className="btn-outline" href={'/templates/'+template.slug+'/docs/pdf/'+pdf.id}>Open PDF</Link>:<span className="template-doc-pdf-locked"><LockKeyhole size={14}/> Restricted</span>}</div>):<p className="text-sm text-slate-500">No PDF documents published yet.</p>}</div></section></div></div>}
    </div>
  </main>;
}
