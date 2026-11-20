'use client';
import {useState} from 'react';
import {Check,Copy} from 'lucide-react';

export function CodeBlock({code,language}:{code:string;language:string}){
  const [copied,setCopied]=useState(false);
  async function copy(){await navigator.clipboard.writeText(code);setCopied(true);window.setTimeout(()=>setCopied(false),1600);}
  return <div className="template-doc-code"><div><span>{language}</span><button type="button" onClick={copy}><Check size={14}/>{copied?'Copied':'Copy'}</button></div><pre><code>{code}</code></pre></div>;
}
