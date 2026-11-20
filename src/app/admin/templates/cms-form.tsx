'use client';

import {useMemo,useState} from 'react';
import type {Category,Template,TemplateAccessLevel} from '@prisma/client';
import {ArrowDown,ArrowUp,ArrowUpRight,Plus,Trash2} from 'lucide-react';
import {saveTemplateCms} from './documentation-actions';

type Section={title:string;content:string};
type Detail={fullDescription:string;requirements:string[];version:string|null;releaseDate:Date|null};
type Feature={id:string;label:string};
type Screenshot={id:string;originalFileName:string;altText:string|null};
type Documentation={accessLevel:TemplateAccessLevel;isPublished:boolean;sections:{slug:string;title:string;content:string;sortOrder:number}[]};
type Design={pageBackground:string;cardBackground:string;accentColor:string;headingColor:string;bodyColor:string;contentWidth:string;imageAspectRatio:string;spacing:string;borderRadius:string;layout:string;showDocumentation:boolean;showScreenshots:boolean};
type ExistingTemplate=Template&{detail?:Detail|null;features:Feature[];screenshots:Screenshot[];documentation?:Documentation|null;designSettings?:Design|null};
type Props={template?:ExistingTemplate;categories:Category[]};

const tabs=[['basic','Basic details'],['documentation','Documentation'],['design','Design'],['access','Access & publishing']] as const;
const defaults:Design={pageBackground:'#0B0D14',cardBackground:'#151722',accentColor:'#7967F4',headingColor:'#F8F9FC',bodyColor:'#A6A7BA',contentWidth:'1180px',imageAspectRatio:'16/9',spacing:'comfortable',borderRadius:'24px',layout:'premium',showDocumentation:true,showScreenshots:true};

export function TemplateCmsForm({template,categories}:Props){
  const [tab,setTab]=useState<(typeof tabs)[number][0]>('basic');
  const [sections,setSections]=useState<Section[]>(template?.documentation?.sections.map(section=>({title:section.title,content:section.content}))||[]);
  const design={...defaults,...template?.designSettings};
  const sectionsJson=useMemo(()=>JSON.stringify(sections),[sections]);
  const addSection=()=>setSections(current=>[...current,{title:'New section',content:'# Heading\n\nWrite the documentation for this section.'}]);
  const updateSection=(index:number,key:keyof Section,value:string)=>setSections(current=>current.map((section,itemIndex)=>itemIndex===index?{...section,[key]:value}:section));
  const removeSection=(index:number)=>setSections(current=>current.filter((_,itemIndex)=>itemIndex!==index));
  const moveSection=(index:number,direction:-1|1)=>setSections(current=>{const nextIndex=index+direction;if(nextIndex<0||nextIndex>=current.length)return current;const next=[...current];[next[index],next[nextIndex]]=[next[nextIndex],next[index]];return next;});
  return <form action={saveTemplateCms} className="template-cms-form">
    <input type="hidden" name="id" value={template?.id||''}/>
    <input type="hidden" name="sectionsJson" value={sectionsJson}/>
    <div className="template-cms-tabs" role="tablist" aria-label="Template editor tabs">
      {tabs.map(([value,label])=><button key={value} type="button" role="tab" aria-selected={tab===value} className={tab===value?'is-active':''} onClick={()=>setTab(value)}>{label}</button>)}
      {template&&<a href="#template-pdf-documents" className="template-cms-tab-link">PDF documents <ArrowUpRight size={14}/></a>}
    </div>

    <section className="template-cms-panel" role="tabpanel" hidden={tab!=='basic'}>
      <div className="template-cms-panel-heading"><div><p className="eyebrow">TAB 01</p><h2>Basic details</h2><p>Control the public template profile and project information.</p></div></div>
      <div className="template-cms-grid">
        <label>Name<input className="form-input" name="name" defaultValue={template?.name||''} required/></label>
        <label>Slug<input className="form-input" name="slug" defaultValue={template?.slug||''} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required/></label>
        <label>Category<select className="form-input" name="categoryId" defaultValue={template?.categoryId||categories[0]?.id} required>{categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label>Price (MMK)<input className="form-input" name="priceMmk" type="number" min="0" defaultValue={template?.priceMmk||0} required/></label>
        <label>License type<input className="form-input" name="licenseType" defaultValue={template?.licenseType||'Commercial'} required/></label>
        <label>Version<input className="form-input" name="version" defaultValue={template?.detail?.version||''} placeholder="1.0.0"/></label>
        <label className="template-cms-wide">Short description<textarea className="form-input min-h-24" name="description" defaultValue={template?.description||''} required/></label>
        <label className="template-cms-wide">Detailed overview<textarea className="form-input min-h-40" name="fullDescription" defaultValue={template?.detail?.fullDescription||template?.description||''} required/></label>
        <label>Technology stack <span className="template-cms-help">comma separated</span><input className="form-input" name="technologyText" defaultValue={template?.technology.join(', ')||''} placeholder="Next.js, TypeScript, Tailwind"/></label>
        <label>Release date<input className="form-input" name="releaseDate" type="date" defaultValue={template?.detail?.releaseDate?.toISOString().slice(0,10)||''}/></label>
        <label className="template-cms-wide">Requirements <span className="template-cms-help">one per line</span><textarea className="form-input min-h-28" name="requirementsText" defaultValue={template?.detail?.requirements.join('\n')||''}/></label>
        <label className="template-cms-wide">Demo URL<input className="form-input" name="demoUrl" type="url" defaultValue={template?.demoUrl||''}/></label>
        <label className="template-cms-wide">Thumbnail URL<input className="form-input" name="thumbnailUrl" type="url" defaultValue={template?.thumbnailUrl||''}/></label>
        <label className="template-cms-wide">Private product ZIP <span className="template-cms-help">ZIP, max 100 MB</span><input className="form-input" type="file" name="sourceFile" accept=".zip,application/zip"/>{template?.sourceFileName&&<small className="template-cms-help">Current file: {template.sourceFileName}{template.sourceFileSize?` · ${(template.sourceFileSize/1024/1024).toFixed(2)} MB`:''}</small>}</label>
        <label className="template-cms-wide">Responsive screenshots <span className="template-cms-help">PNG, JPG, or WEBP, max 8 MB each</span><input className="form-input" type="file" name="screenshotFiles" accept="image/png,image/jpeg,image/webp" multiple/></label>
        {template?.screenshots.length?<div className="template-cms-wide template-cms-screenshot-list">{template.screenshots.map(screenshot=><label className="template-cms-screenshot" key={screenshot.id}><img src={'/api/templates/'+template.id+'/screenshots/'+screenshot.id} alt={screenshot.altText||screenshot.originalFileName}/><span><input type="checkbox" name="removeScreenshotId" value={screenshot.id}/> Remove {screenshot.originalFileName}</span></label>)}</div>:null}
        <label className="template-cms-wide">Project features <span className="template-cms-help">one feature per line</span><textarea className="form-input min-h-32" name="featuresText" defaultValue={template?.features.map(feature=>feature.label).join('\n')||''} placeholder="Responsive layouts\nReusable components\nProduction-ready structure"/></label>
      </div>
    </section>

    <section className="template-cms-panel" role="tabpanel" hidden={tab!=='documentation'}>
      <div className="template-cms-panel-heading"><div><p className="eyebrow">TAB 02</p><h2>Documentation</h2><p>Build ordered sections with headings, lists, images, links, blockquotes and fenced code blocks.</p></div><button type="button" className="btn-outline" onClick={addSection}><Plus size={16}/> Add section</button></div>
      <div className="template-cms-help-box">Supported format: heading lines, list lines, blockquotes, image syntax, inline code, and fenced code blocks.</div>
      <div className="template-cms-sections">
        {sections.length?sections.map((section,index)=><article className="template-cms-section-editor" key={index}><div className="template-cms-section-top"><label>Section {index+1} title<input className="form-input" value={section.title} onChange={event=>updateSection(index,'title',event.target.value)} required/></label><div className="template-cms-section-actions"><button type="button" className="icon-button" onClick={()=>moveSection(index,-1)} disabled={index===0} aria-label="Move section up"><ArrowUp size={15}/></button><button type="button" className="icon-button" onClick={()=>moveSection(index,1)} disabled={index===sections.length-1} aria-label="Move section down"><ArrowDown size={15}/></button><button type="button" className="icon-button text-red-200" onClick={()=>removeSection(index)} aria-label="Remove section"><Trash2 size={16}/></button></div></div><label>Content<textarea className="form-input template-cms-doc-textarea" value={section.content} onChange={event=>updateSection(index,'content',event.target.value)} required/></label></article>):<div className="template-cms-empty">No documentation sections yet. Add the first section to make the documentation reader available.</div>}
      </div>
    </section>

    <section className="template-cms-panel" role="tabpanel" hidden={tab!=='design'}>
      <div className="template-cms-panel-heading"><div><p className="eyebrow">TAB 03</p><h2>Design settings</h2><p>Set per-template presentation tokens used by the customer detail and docs pages.</p></div></div>
      <div className="template-cms-grid">
        {([['pageBackground','Page background'],['cardBackground','Card background'],['accentColor','Accent color'],['headingColor','Heading color'],['bodyColor','Body text color']] as const).map(([name,label])=><label key={name}>{label}<span className="template-cms-color-field"><input type="color" name={name} defaultValue={design[name]}/><input className="form-input" value={design[name]} readOnly/></span></label>)}
        <label>Content width<select className="form-input" name="contentWidth" defaultValue={design.contentWidth}><option>1080px</option><option>1180px</option><option>1280px</option></select></label>
        <label>Image aspect ratio<select className="form-input" name="imageAspectRatio" defaultValue={design.imageAspectRatio}><option>16/9</option><option>4/3</option><option>1/1</option><option>auto</option></select></label>
        <label>Spacing<select className="form-input" name="spacing" defaultValue={design.spacing}><option>compact</option><option>comfortable</option><option>spacious</option></select></label>
        <label>Border radius<select className="form-input" name="borderRadius" defaultValue={design.borderRadius}><option>16px</option><option>24px</option><option>32px</option></select></label>
        <label>Layout<select className="form-input" name="layout" defaultValue={design.layout}><option>premium</option><option>editorial</option><option>minimal</option></select></label>
      </div>
    </section>

    <section className="template-cms-panel" role="tabpanel" hidden={tab!=='access'}>
      <div className="template-cms-panel-heading"><div><p className="eyebrow">TAB 04</p><h2>Access & publishing</h2><p>Keep documentation and product files behind the existing account and paid-license checks.</p></div></div>
      <div className="template-cms-grid">
        <label>Template status<select className="form-input" name="status" defaultValue={template?.status||'DRAFT'}><option>DRAFT</option><option>PUBLISHED</option><option>ARCHIVED</option></select></label>
        <label>Documentation access<select className="form-input" name="documentationAccess" defaultValue={template?.documentation?.accessLevel||'PUBLIC'}><option value="PUBLIC">Public</option><option value="AUTHENTICATED">Registered users</option><option value="PURCHASER">Purchasers only</option></select></label>
        <label className="template-cms-check"><input type="checkbox" name="documentationPublished" value="true" defaultChecked={template?.documentation?.isPublished||false}/> Publish documentation reader</label>
        <label className="template-cms-check"><input type="checkbox" name="showDocumentation" value="true" defaultChecked={design.showDocumentation}/> Show documentation link</label>
        <label className="template-cms-check"><input type="checkbox" name="showScreenshots" value="true" defaultChecked={design.showScreenshots}/> Show screenshots</label>
      </div>
    </section>

    <div className="template-cms-submit"><button className="btn-primary">{template?'Save changes':'Create template'}</button>{template&&<a className="btn-outline" href={`/templates/${template.slug}`} target="_blank" rel="noreferrer">Preview public page <ArrowUpRight size={15}/></a>}</div>
  </form>;
}
