import { z } from 'zod';

export const websiteSchemaVersion = 1;

const safeText = (max: number) => z.string().trim().max(max).refine(
  (value) => !/<\/?script\b|javascript:|on[a-z]+\s*=|data:text\/html/i.test(value),
  'Unsafe markup or URL content is not allowed.',
);

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color.');
const url = z.string().url().refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Only HTTP(S) URLs are allowed.');

const component = z.discriminatedUnion('type', [
  z.object({ type: z.literal('HERO'), headline: safeText(180), description: safeText(600), ctaLabel: safeText(60), ctaUrl: url.optional() }),
  z.object({ type: z.literal('FEATURES'), title: safeText(180), items: z.array(z.object({ title: safeText(120), description: safeText(300) })).min(1).max(12) }),
  z.object({ type: z.literal('SERVICES'), title: safeText(180), items: z.array(z.object({ title: safeText(120), description: safeText(300) })).min(1).max(12) }),
  z.object({ type: z.literal('ABOUT'), title: safeText(180), body: safeText(1000) }),
  z.object({ type: z.literal('PORTFOLIO'), title: safeText(180), items: z.array(z.object({ title: safeText(120), description: safeText(300), imageUrl: url.optional() })).max(12) }),
  z.object({ type: z.literal('TESTIMONIALS'), title: safeText(180), items: z.array(z.object({ quote: safeText(400), author: safeText(120), isPlaceholder: z.literal(true) })).max(12) }),
  z.object({ type: z.literal('PRICING'), title: safeText(180), items: z.array(z.object({ name: safeText(120), price: safeText(80), description: safeText(300) })).max(8) }),
  z.object({ type: z.literal('FAQ'), title: safeText(180), items: z.array(z.object({ question: safeText(240), answer: safeText(500) })).max(20) }),
  z.object({ type: z.literal('CONTACT_CTA'), title: safeText(180), description: safeText(600), ctaLabel: safeText(60), ctaUrl: url.optional() }),
  z.object({ type: z.literal('FOOTER'), copyright: safeText(180), links: z.array(z.object({ label: safeText(80), href: url })).max(20) }),
]);

export const websiteSchema = z.object({
  version: z.literal(websiteSchemaVersion),
  metadata: z.object({ title: safeText(180), description: safeText(320), language: z.enum(['en', 'my']) }),
  theme: z.object({
    background: hexColor,
    surface: hexColor,
    primary: hexColor,
    accent: hexColor,
    text: hexColor,
    headingFont: z.enum(['Inter', 'Manrope', 'Noto Sans Myanmar']),
    bodyFont: z.enum(['Inter', 'Manrope', 'Noto Sans Myanmar']),
  }),
  navigation: z.array(z.object({ label: safeText(80), href: url.optional() })).max(20),
  pages: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), title: safeText(180), sections: z.array(component).max(40) })).min(1).max(20),
  footer: z.object({ copyright: safeText(180) }),
  seo: z.object({ title: safeText(180), description: safeText(320) }),
}).superRefine((value, ctx) => {
  const slugs = value.pages.map((page) => page.slug);
  if (new Set(slugs).size !== slugs.length) ctx.addIssue({ code: 'custom', path: ['pages'], message: 'Page slugs must be unique.' });
});

export type WebsiteDefinition = z.infer<typeof websiteSchema>;

export const websiteBuilderInput = z.object({
  name: safeText(120).min(1),
  description: safeText(1000).min(1),
  websiteType: z.enum(['PORTFOLIO', 'BUSINESS', 'LANDING_PAGE', 'AGENCY', 'PRODUCT_SHOWCASE', 'ECOMMERCE_CONCEPT']),
  language: z.enum(['en', 'my']).default('en'),
  style: z.enum(['PREMIUM_DARK', 'MINIMAL', 'BOLD', 'EDITORIAL']).default('PREMIUM_DARK'),
});

export type WebsiteBuilderInput = z.infer<typeof websiteBuilderInput>;

export function emptyWebsiteDefinition(input: WebsiteBuilderInput): WebsiteDefinition {
  return {
    version: websiteSchemaVersion,
    metadata: { title: input.name, description: input.description, language: input.language },
    theme: { background: '#09090F', surface: '#171725', primary: '#8B5CF6', accent: '#22D3EE', text: '#F8FAFC', headingFont: 'Inter', bodyFont: input.language === 'my' ? 'Noto Sans Myanmar' : 'Inter' },
    navigation: [],
    pages: [{ slug: 'home', title: input.name, sections: [] }],
    footer: { copyright: `© ${new Date().getFullYear()} ${input.name}` },
    seo: { title: input.name, description: input.description },
  };
}
