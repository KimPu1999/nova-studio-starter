'use client';

import dynamic from 'next/dynamic';

export const PdfReader=dynamic(
  ()=>import('./pdf-reader').then(module=>module.PdfReader),
  {ssr:false,loading:()=> <div className="template-pdf-reader-state">Loading PDF reader…</div>}
);
