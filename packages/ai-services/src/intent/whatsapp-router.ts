import { z } from 'zod';
import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import type { WhatsappTextIntent } from './whatsapp-text';
import { buildWhatsappIntentRouterPrompt } from './whatsapp-router-prompt';

const whatsappIntentRouterSchema = z.object({
  intents: z
    .array(z.enum(['task', 'reminder', 'note', 'event']))
    .default([]),
});

type WhatsappIntentRouterResult = z.infer<typeof whatsappIntentRouterSchema>;

// Priority order: task > note > reminder > event
const INTENT_PRIORITY: WhatsappTextIntent[] = ['task', 'note', 'reminder', 'event'];

export class WhatsappIntentRouterService {
  private model;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error({}, 'OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY environment variable is required. Please set it in your environment.');
    }

    const openaiClient = createOpenAI({
      apiKey: apiKey,
    });

    this.model = openaiClient('gpt-4o-mini');
  }

  async detectIntents(text: string): Promise<WhatsappTextIntent[]> {
    try {
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
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          textLength: text.length,
        },
        'Failed to detect intents with router'
      );
      // Return empty array on error - will fall back to trying all
      return [];
    }
  }

  /**
   * Get the highest priority intent from detected intents
   * Priority: task > note > reminder > event
   */
  getPrimaryIntent(detectedIntents: WhatsappTextIntent[]): WhatsappTextIntent | null {
    if (detectedIntents.length === 0) {
      return null;
    }

    // Return the first intent that appears in priority order
    for (const priorityIntent of INTENT_PRIORITY) {
      if (detectedIntents.includes(priorityIntent)) {
        return priorityIntent;
      }
    }

    // Fallback: return first detected intent
    return detectedIntents[0];
  }
}

