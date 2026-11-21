import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, Code2, Layers3, LockKeyhole, Sparkles, WalletCards } from 'lucide-react';
import { products } from '@/lib/data';
import { ProductCard } from '@/components/product-card';

const categories = [
  { label: 'Website templates', description: 'Launch-ready foundations', icon: Layers3 },
  { label: 'UI kits', description: 'Flexible visual systems', icon: Sparkles },
  { label: 'Source code', description: 'Build faster from solid ground', icon: Code2 },
  { label: 'Design assets', description: 'The details that finish a product', icon: WalletCards },
];

const steps = [
  ['01', 'Explore', 'Find a considered starting point for your next digital idea.'],
  ['02', 'Customize', 'Shape the system around your brand, audience, and ambition.'],
  ['03', 'Launch', 'Download your files and move from first click to first release.'],
];

export default function Home() {
  return <main className="aurora-home">
    <section className="aurora-hero">
      <div className="aurora-blob aurora-blob-blue" /><div className="aurora-blob aurora-blob-mint" /><div className="aurora-stars" />
      <div className="container-wide aurora-hero-inner">
        <div className="aurora-hero-copy"><span className="aurora-kicker"><Sparkles size={14} /> NOVA DIGITAL MARKETPLACE</span><h1>Build something<br /><span>brighter.</span></h1><p>Premium templates, UI kits, and source code for people shaping what comes next on the web.</p><div className="aurora-hero-actions"><Link href="/templates" className="aurora-solid-button">Explore templates <ArrowUpRight size={17} /></Link><Link href="#collection" className="aurora-ghost-button">View the collection <ArrowRight size={17} /></Link></div><div className="aurora-hero-trust"><span><Check size={14} /> Production-ready files</span><span><LockKeyhole size={14} /> Clear licensing</span></div></div>
        <div className="aurora-hero-art" aria-label="Abstract NOVA product showcase"><div className="aurora-ring ring-one" /><div className="aurora-ring ring-two" /><div className="aurora-product-sheet sheet-back"><small>NO. 02 / UI SYSTEM</small><strong>Made<br /><em>to move.</em></strong><div className="sheet-lines"><i /><i /><i /></div></div><div className="aurora-product-sheet sheet-front"><div className="sheet-top"><span><i /><i /><i /></span><small>nova / studio</small></div><div className="sheet-content"><small>DESIGN FOR MOMENTUM</small><strong>Turn ideas<br />into <em>impact.</em></strong><div className="sheet-pills"><i /><i /><i /></div></div></div><div className="aurora-floating-chip"><span /> Carefully crafted digital products</div></div>
      </div>
    </section>

    <section id="collection" className="container-wide aurora-section"><div className="aurora-section-heading"><div><span className="aurora-eyebrow">THE COLLECTION</span><h2>A sharper place<br />to <em>start.</em></h2><p>Thoughtful digital foundations with the structure and point of view to take your idea further.</p></div><Link href="/templates" className="aurora-text-link">Browse all products <ArrowUpRight size={16} /></Link></div><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <ProductCard key={product.slug} product={product} />)}</div></section>

    <section className="aurora-band"><div className="container-wide aurora-section"><div className="aurora-section-heading"><div><span className="aurora-eyebrow">SHOP BY FORMAT</span><h2>Built for the way<br />you <em>build.</em></h2></div></div><div className="aurora-category-grid">{categories.map(({ label, description, icon: Icon }, index) => <Link href="/templates" className="aurora-category-card" key={label}><span className="aurora-category-number">0{index + 1}</span><span className="aurora-category-icon"><Icon size={19} /></span><strong>{label}</strong><small>{description}</small><ArrowUpRight className="aurora-category-arrow" size={17} /></Link>)}</div></div></section>

    <section className="container-wide aurora-section aurora-reasons"><div><span className="aurora-eyebrow">WHY NOVA</span><h2>Less searching.<br /><em>More making.</em></h2><p>Every product is selected for clarity, flexibility, and the details that make a build feel finished.</p></div><div className="aurora-reason-list"><div><Check size={17} /><span><strong>Useful from day one</strong><small>Clean structure, reusable components, and files that respect your time.</small></span></div><div><Check size={17} /><span><strong>Clear by design</strong><small>Transparent pricing, straightforward licenses, and no mystery steps.</small></span></div><div><Check size={17} /><span><strong>Distinctly yours</strong><small>Start with a strong point of view, then make it unmistakably your own.</small></span></div></div></section>

    <section id="how-it-works" className="aurora-band"><div className="container-wide aurora-section"><div className="aurora-section-heading"><div><span className="aurora-eyebrow">HOW IT WORKS</span><h2>From first click<br />to <em>first launch.</em></h2></div></div><div className="aurora-step-grid">{steps.map(([number, title, copy]) => <div className="aurora-step-card" key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div><ArrowUpRight size={17} /></div>)}</div></div></section>

    <section className="container-wide aurora-section aurora-final-cta"><div><span className="aurora-eyebrow">START SOMEWHERE GOOD</span><h2>Make your next<br /><em>move memorable.</em></h2><p>Explore the collection and find the foundation your idea deserves.</p><Link href="/templates" className="aurora-solid-button">Explore the collection <ArrowUpRight size={17} /></Link></div><div className="aurora-final-orb"><span>✳</span><small>NOVA<br />STUDIO</small></div></section>
  </main>;
}
