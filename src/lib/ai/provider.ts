export type AiGenerationInput = { prompt: string; model?: string; maxOutputTokens?: number };
export type AiGenerationResult = { text: string; provider: string; model: string; requestId?: string; inputTokens?: number; outputTokens?: number };

export interface AiProviderAdapter {
  readonly key: string;
  generateText(input: AiGenerationInput): Promise<AiGenerationResult>;
}

class DisabledProvider implements AiProviderAdapter {
  readonly key = 'disabled';
  async generateText(): Promise<AiGenerationResult> {
    throw new Error('AI_PROVIDER_NOT_CONFIGURED');
  }
}

export function getAiProvider(): AiProviderAdapter {
  // Provider credentials are intentionally not read by browser code. An adapter can
  // be added here once an approved provider and server-side secret are configured.
  return new DisabledProvider();
}

export function aiIsEnabled() {
  return process.env.AI_ENABLED === 'true' && process.env.AI_PROVIDER !== 'disabled';
}
