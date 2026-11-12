export const brand = 'NOVA Studio';
export type Product = {slug:string;name:string;category:string;price:number;description:string;gradient:string;tag:string;features:string[];stack:string[]};
export const products:Product[] = [
 {slug:'commerce-kit',name:'Commerce Kit',category:'E-Commerce',price:45000,description:'An elegant storefront UI with responsive catalog, product views and polished shopping layouts.',gradient:'from-violet-700 via-fuchsia-800 to-slate-950',tag:'Popular',features:['Responsive storefront','Product listing layouts','Cart interface mockup','Reusable components'],stack:['Next.js','TypeScript','Tailwind CSS']},
 {slug:'restaurant-pro',name:'Restaurant Pro',category:'Restaurant',price:35000,description:'An atmospheric restaurant experience with menu presentation and reservation call-to-action.',gradient:'from-orange-700 via-rose-900 to-slate-950',tag:'New',features:['Menu showcase','Reservation CTA UI','Mobile navigation','Gallery sections'],stack:['Next.js','Tailwind CSS']},
 {slug:'agency-flow',name:'Agency Flow',category:'Business',price:39000,description:'A confident studio presence with service sections, case studies and lead generation layouts.',gradient:'from-cyan-700 via-indigo-900 to-slate-950',tag:'Featured',features:['Service layouts','Case study cards','Contact UI','SEO-friendly structure'],stack:['Next.js','TypeScript','Tailwind CSS']}
];
export const money=(value:number)=>`${value.toLocaleString('en-US')} MMK`;
