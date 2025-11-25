import { z } from 'zod';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { WhatsappTextIntent } from './whatsapp-text';
import { buildWhatsappIntentRouterPrompt } from './whatsapp-router-prompt';

const whatsappIntentRouterSchema = z.object({
  intents: z
    .array(z.enum(['task', 'reminder', 'note', 'event']))
    .default([]),
});

type WhatsappIntentRouterResult = z.infer<typeof whatsappIntentRouterSchema>;

export class WhatsappIntentRouterService {
  private model = openai('gpt-4o-mini');

  async detectIntents(text: string): Promise<WhatsappTextIntent[]> {
    const prompt = buildWhatsappIntentRouterPrompt(text);
    const result = await generateObject({
      model: this.model,
      schema: whatsappIntentRouterSchema as any,
      prompt,
    });

    const parsed = result.object as WhatsappIntentRouterResult;
    // De-duplicate while preserving order
    const seen = new Set<WhatsappTextIntent>();
    const ordered: WhatsappTextIntent[] = [];
    for (const intent of parsed.intents) {
      if (!seen.has(intent)) {
        seen.add(intent);
        ordered.push(intent as WhatsappTextIntent);
      }
    }
    return ordered;
  }
}

