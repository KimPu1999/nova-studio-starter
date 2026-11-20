import Link from 'next/link';
import {ArrowLeft} from 'lucide-react';
import {notFound} from 'next/navigation';
import {databaseConfigured,prisma} from '@/lib/prisma';
import {currentUser} from '@/lib/auth';
import {canAccessTemplatePdf} from '@/lib/template-access';
import {PdfReader} from '@/components/pdf-reader-client';

export const dynamic='force-dynamic';

export default async function TemplatePdf({params}:{params:Promise<{slug:string;id:string}>}){
  const {slug,id}=await params;
  if(!databaseConfigured)notFound();
  if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
  const template=await prisma.template.findUnique({where:{slug,status:'PUBLISHED'},select:{id:true,name:true}});
  if(!template)notFound();
  const pdf=await prisma.templatePdfFile.findFirst({where:{id,templateId:template.id,isVisible:true}});
  if(!pdf)notFound();
  const user=await currentUser();
  if(!await canAccessTemplatePdf(template.id,pdf.accessLevel,user))notFound();
  const src='/api/templates/'+slug+'/documents/'+pdf.id;
  return <main className="template-pdf-page page-pad"><div className="container-wide"><Link href={'/templates/'+slug+'/docs'} className="template-docs-back"><ArrowLeft size={16}/> Back to documentation</Link><header className="template-pdf-header"><p className="eyebrow">{template.name}</p><h1>{pdf.title}</h1><p>{pdf.description||pdf.originalFileName}</p></header><PdfReader src={src} downloadHref={pdf.downloadEnabled?src+'?download=1':undefined} downloadEnabled={pdf.downloadEnabled} title={pdf.title}/></div></main>;
}
