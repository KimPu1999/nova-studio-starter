import {FileText,Trash2,ExternalLink} from 'lucide-react';
import {uploadTemplatePdf,updateTemplatePdf,deleteTemplatePdf} from './documentation-actions';
import type {TemplateAccessLevel} from '@prisma/client';

type Pdf={id:string;templateId:string;title:string;description:string|null;originalFileName:string;fileSize:number;version:string|null;sortOrder:number;accessLevel:TemplateAccessLevel;downloadEnabled:boolean;isVisible:boolean};

function size(bytes:number){return bytes<1024*1024?(bytes/1024).toFixed(0)+' KB':(bytes/1024/1024).toFixed(1)+' MB';}

export function TemplatePdfManager({templateId,templateSlug,pdfs}:{templateId:string;templateSlug:string;pdfs:Pdf[]}){
  return <section id="template-pdf-documents" className="template-pdf-manager">
    <div className="template-cms-panel-heading"><div><p className="eyebrow">TAB 05</p><h2>PDF documents</h2><p>Private PDF files are served through an entitlement-checked route.</p></div></div>
    <form action={uploadTemplatePdf} encType="multipart/form-data" className="template-pdf-upload">
      <input type="hidden" name="templateId" value={templateId}/>
      <div className="template-cms-grid">
        <label>PDF file<input className="form-input" type="file" name="file" accept="application/pdf" required/></label>
        <label>Document title<input className="form-input" name="title" placeholder="Installation guide" required/></label>
        <label>Version<input className="form-input" name="version" placeholder="1.0.0"/></label>
        <label>Sort order<input className="form-input" name="sortOrder" type="number" min="0" defaultValue="0"/></label>
        <label>Access level<select className="form-input" name="accessLevel" defaultValue="PURCHASER"><option value="PUBLIC">Public</option><option value="AUTHENTICATED">Registered users</option><option value="PURCHASER">Purchasers only</option></select></label>
        <label className="template-cms-wide">Description<textarea className="form-input min-h-20" name="description"/></label>
        <label className="template-cms-check"><input type="checkbox" name="downloadEnabled" value="true"/> Allow download for permitted users</label>
      </div>
      <button className="btn-primary mt-5"><FileText size={16}/> Upload PDF</button>
    </form>
    <div className="template-pdf-list">
      {pdfs.length?pdfs.map(pdf=><article className="template-pdf-row" key={pdf.id}>
        <div className="template-pdf-row-icon"><FileText size={20}/></div>
        <div className="template-pdf-row-info"><strong>{pdf.title}</strong><span>{pdf.originalFileName} · {size(pdf.fileSize)}{pdf.version?' · v'+pdf.version:''}</span></div>
        <a className="icon-button" href={'/templates/'+templateSlug+'/docs/pdf/'+pdf.id} target="_blank" rel="noreferrer" aria-label={'Preview '+pdf.title}><ExternalLink size={15}/></a>
        <details className="template-pdf-edit"><summary>Edit</summary><form action={updateTemplatePdf} className="template-pdf-edit-form"><input type="hidden" name="id" value={pdf.id}/><label>Title<input className="form-input" name="title" defaultValue={pdf.title} required/></label><label>Description<textarea className="form-input" name="description" defaultValue={pdf.description||''}/></label><label>Version<input className="form-input" name="version" defaultValue={pdf.version||''}/></label><label>Sort order<input className="form-input" name="sortOrder" type="number" min="0" defaultValue={pdf.sortOrder}/></label><label>Access<select className="form-input" name="accessLevel" defaultValue={pdf.accessLevel}><option value="PUBLIC">Public</option><option value="AUTHENTICATED">Registered users</option><option value="PURCHASER">Purchasers only</option></select></label><label className="template-cms-check"><input type="checkbox" name="downloadEnabled" value="true" defaultChecked={pdf.downloadEnabled}/> Download enabled</label><label className="template-cms-check"><input type="checkbox" name="isVisible" value="true" defaultChecked={pdf.isVisible}/> Visible</label><div className="flex gap-2"><button className="btn-primary">Save PDF</button><button className="btn-outline" formAction={deleteTemplatePdf}><Trash2 size={15}/> Delete</button></div></form></details>
      </article>):<div className="template-cms-empty">No PDF documents uploaded.</div>}
    </div>
  </section>;
}
