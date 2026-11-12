import { describe, expect, it } from 'vitest';
import { emptyWebsiteDefinition, websiteSchema } from '../src/lib/ai/schema';
import { aiIsEnabled, getAiProvider } from '../src/lib/ai/provider';

describe('AI safety foundation', () => {
  it('creates a valid, non-executable website definition', () => {
    const result = websiteSchema.safeParse(emptyWebsiteDefinition({ name: 'NOVA', description: 'A studio', websiteType: 'BUSINESS', language: 'en', style: 'PREMIUM_DARK' }));
    expect(result.success).toBe(true);
  });

  it('rejects unsupported and unsafe website content', () => {
    const definition = emptyWebsiteDefinition({ name: 'NOVA', description: 'A studio', websiteType: 'BUSINESS', language: 'en', style: 'PREMIUM_DARK' });
    definition.pages[0].sections = [{ type: 'HERO', headline: '<script>alert(1)</script>', description: 'x', ctaLabel: 'Go' }];
    expect(websiteSchema.safeParse(definition).success).toBe(false);
  });

  it('uses a disabled provider unless explicitly configured', async () => {
    expect(aiIsEnabled()).toBe(false);
    await expect(getAiProvider().generateText({ prompt: 'test' })).rejects.toThrow('AI_PROVIDER_NOT_CONFIGURED');
  });
});
