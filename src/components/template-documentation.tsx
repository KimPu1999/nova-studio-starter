import Link from 'next/link';
import {CodeBlock} from './template-code-block';
import {slugify} from '@/lib/template-docs';

function safeImageUrl(value:string){
  return value.startsWith('/')||value.startsWith('https://')||value.startsWith('http://');
}

function inlineParts(value:string){
  return value.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g).map((part,index)=>{
    const link=part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if(link&&(link[2].startsWith('/')||link[2].startsWith('https://')))return <a key={index} href={link[2]} target={link[2].startsWith('http')?'_blank':undefined} rel={link[2].startsWith('http')?'noreferrer':undefined}>{link[1]}</a>;
    if(part.startsWith('`')&&part.endsWith('`'))return <code key={index} className="template-doc-inline-code">{part.slice(1,-1)}</code>;
    if(part.startsWith('**')&&part.endsWith('**'))return <strong key={index}>{part.slice(2,-2)}</strong>;
    return <span key={index}>{part}</span>;
  });
}

export function DocumentationContent({content}:{content:string}){
  const lines=content.replace(/\r/g,'').split('\n');
  const blocks:React.ReactNode[]=[];
  let index=0;
  while(index<lines.length){
    const line=lines[index];
    if(line.trim()===''){index++;continue;}
    if(line.startsWith('```')){
      const language=line.slice(3).trim()||'text';
      const code:string[]=[];index++;
      while(index<lines.length&&!lines[index].startsWith('```')){code.push(lines[index]);index++;}
      if(index<lines.length)index++;
      blocks.push(<CodeBlock key={blocks.length} code={code.join('\n')} language={language}/>);
      continue;
    }
    if(line.startsWith('# ')){blocks.push(<h2 key={blocks.length} id={slugify(line.slice(2))}>{line.slice(2)}</h2>);index++;continue;}
    if(line.startsWith('## ')){blocks.push(<h3 key={blocks.length} id={slugify(line.slice(3))}>{line.slice(3)}</h3>);index++;continue;}
    if(line.startsWith('> ')){blocks.push(<blockquote key={blocks.length}>{inlineParts(line.slice(2))}</blockquote>);index++;continue;}
    if(line.startsWith('- ')||line.startsWith('* ')){
      const items:string[]=[];
      while(index<lines.length&&(lines[index].startsWith('- ')||lines[index].startsWith('* '))){items.push(lines[index].slice(2));index++;}
      blocks.push(<ul key={blocks.length}>{items.map((item,itemIndex)=><li key={itemIndex}>{inlineParts(item)}</li>)}</ul>);
      continue;
    }
    const image=line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if(image&&safeImageUrl(image[2])){blocks.push(<figure key={blocks.length}><img src={image[2]} alt={image[1]}/><figcaption>{image[1]}</figcaption></figure>);index++;continue;}
    const paragraph:string[]=[line];index++;
    while(index<lines.length&&lines[index].trim()!==''&&!/^#{1,2} /.test(lines[index])&&!lines[index].startsWith('> ')&&!/^[-*] /.test(lines[index])&&!lines[index].startsWith('```')){paragraph.push(lines[index]);index++;}
    blocks.push(<p key={blocks.length}>{inlineParts(paragraph.join('\n'))}</p>);
  }
  return <div className="template-doc-content">{blocks}</div>;
}

export function DocumentationSidebar({sections,slug,currentSlug}:{sections:{slug:string;title:string}[];slug:string;currentSlug?:string}){
  return <nav className="template-doc-sidebar" aria-label="Documentation sections">
    <p className="template-doc-sidebar-label">ON THIS PAGE</p>
    {sections.map(section=><Link className={currentSlug===section.slug?'is-active':''} href={`/templates/${slug}/docs#${section.slug}`} key={section.slug}>{section.title}</Link>)}
  </nav>;
}
