import type { ReactNode } from 'react';
import { websiteSchema, type WebsiteDefinition } from '@/lib/ai/schema';

export function renderPublishedWebsite(raw: unknown): ReactNode {
  const parsed = websiteSchema.safeParse(raw);
  if (!parsed.success) return <div className="min-h-screen bg-[#09090F] p-10 text-slate-200">This published website snapshot is unavailable.</div>;
  return <WebsiteCanvas definition={parsed.data}/>;
}

function WebsiteCanvas({ definition }: { definition: WebsiteDefinition }) {
  const page = definition.pages[0];
  return <main style={{ backgroundColor: definition.theme.background, color: definition.theme.text }} className="min-h-screen"><header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6"><span className="font-semibold" style={{ color: definition.theme.primary }}>{definition.metadata.title}</span><nav className="flex gap-4 text-sm">{definition.navigation.map((item) => <a key={item.label} href={item.href || '#'}>{item.label}</a>)}</nav></header><div className="mx-auto max-w-6xl px-6 pb-20">{page?.sections.map((section, index) => <section key={`${section.type}-${index}`} className="border-t border-white/10 py-16">{renderSection(section)}</section>)}</div><footer className="border-t border-white/10 px-6 py-8 text-center text-sm opacity-70">{definition.footer.copyright}</footer></main>;
}

function renderSection(section: WebsiteDefinition['pages'][number]['sections'][number]): ReactNode {
  switch (section.type) {
    case 'HERO': return <><p className="text-xs uppercase tracking-[0.2em] text-violet-300">{section.type}</p><h1 className="mt-4 max-w-3xl text-4xl font-bold md:text-6xl">{section.headline}</h1><p className="mt-5 max-w-2xl text-lg opacity-75">{section.description}</p>{section.ctaUrl && <a className="mt-8 inline-flex rounded-lg bg-violet-500 px-5 py-3 font-medium" href={section.ctaUrl}>{section.ctaLabel}</a>}</>;
    case 'ABOUT': return <><h2 className="text-3xl font-bold">{section.title}</h2><p className="mt-4 max-w-3xl whitespace-pre-wrap leading-8 opacity-75">{section.body}</p></>;
    case 'CONTACT_CTA': return <><h2 className="text-3xl font-bold">{section.title}</h2><p className="mt-4 max-w-2xl opacity-75">{section.description}</p></>;
    case 'FOOTER': return <p className="text-sm opacity-75">{section.copyright}</p>;
    default: return <><h2 className="text-3xl font-bold">{section.title}</h2><div className="mt-7 grid gap-4 md:grid-cols-3">{section.items.map((item, index) => { const value = item as ItemText; return <article key={index} className="rounded-2xl border border-white/10 bg-white/[.03] p-5"><h3 className="font-semibold">{value.name || value.title || value.question || value.author}</h3><p className="mt-3 text-sm leading-6 opacity-70">{value.description || value.answer || value.quote || value.price || ''}</p></article>; })}</div></>;
  }
}

type ItemText = { name?: string; title?: string; question?: string; author?: string; description?: string; answer?: string; quote?: string; price?: string };
