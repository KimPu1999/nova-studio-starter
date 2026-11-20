'use client';

import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Download,Expand,Minus,Plus,RefreshCcw} from 'lucide-react';
import {Document,Page,pdfjs} from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();

export function PdfReader({src,downloadHref,downloadEnabled,title}:{src:string;downloadHref?:string;downloadEnabled:boolean;title:string}){
  const containerRef=useRef<HTMLDivElement>(null);
  const [pages,setPages]=useState(0);
  const [page,setPage]=useState(1);
  const [scale,setScale]=useState(1);
  const [fitWidth,setFitWidth]=useState(true);
  const [width,setWidth]=useState(720);
  const [error,setError]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  useEffect(()=>{
    const node=containerRef.current;
    if(!node)return;
    const observer=new ResizeObserver(entries=>setWidth(Math.max(280,Math.floor(entries[0].contentRect.width-32))));
    observer.observe(node);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{if(page>pages&&pages)setPage(pages)},[page,pages]);
  function zoom(delta:number){setFitWidth(false);setScale(value=>Math.min(2.5,Math.max(.65,value+delta)));}
  async function toggleFullscreen(){if(!containerRef.current)return;if(!document.fullscreenElement)await containerRef.current.requestFullscreen();else await document.exitFullscreen();setFullscreen(Boolean(document.fullscreenElement));}
  return <section className={`pdf-reader ${fullscreen?'is-fullscreen':''}`} ref={containerRef} aria-label={title}>
    <div className="pdf-reader-toolbar">
      <div className="pdf-reader-title"><span>PDF</span><strong>{title}</strong></div>
      <div className="pdf-reader-controls">
        <button type="button" onClick={()=>setPage(value=>Math.max(1,value-1))} disabled={page<=1} aria-label="Previous page"><ChevronLeft size={17}/></button>
        <span>{page} / {pages||'—'}</span>
        <button type="button" onClick={()=>setPage(value=>Math.min(pages||value+1,value+1))} disabled={!pages||page>=pages} aria-label="Next page"><ChevronRight size={17}/></button>
        <button type="button" onClick={()=>zoom(-.15)} aria-label="Zoom out"><Minus size={15}/></button>
        <span className="pdf-reader-scale">{Math.round((fitWidth?1:scale)*100)}%</span>
        <button type="button" onClick={()=>zoom(.15)} aria-label="Zoom in"><Plus size={15}/></button>
        <button type="button" onClick={()=>setFitWidth(true)} className={fitWidth?'is-active':''}>Fit</button>
        <button type="button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Expand size={15}/></button>
        {downloadEnabled&&downloadHref&&<a href={downloadHref} aria-label="Download PDF"><Download size={15}/></a>}
      </div>
    </div>
    <div className="pdf-reader-stage">
      {error?<div className="pdf-reader-state"><p>Unable to load this PDF.</p><button type="button" className="btn-outline" onClick={()=>setError(false)}><RefreshCcw size={15}/> Try again</button></div>:<Document file={src} onLoadSuccess={({numPages})=>{setPages(numPages);setPage(1)}} onLoadError={()=>setError(true)} loading={<div className="pdf-reader-state">Loading PDF…</div>} error={<div className="pdf-reader-state">Unable to load this PDF.</div>}>
        <Page pageNumber={page} width={fitWidth?width:undefined} scale={fitWidth?undefined:scale} renderTextLayer renderAnnotationLayer/>
      </Document>}
    </div>
    <p className="pdf-reader-note">Use the controls to navigate, zoom, fit, or open the reader fullscreen.</p>
  </section>;
}
