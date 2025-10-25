// Intent Analysis Service using AI SDK
// Extracts raw intent - resolvers handle data lookup

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { calendarIntentPrompt, type IntentPromptContext } from './prompts';
import { calendarIntentSchema } from './types';
import type { CalendarIntent, IntentContext } from './types';

export class IntentAnalysisService {
  private model = openai('gpt-4o-mini'); // Fast and cost-effective

  async analyzeCalendarIntent(
    text: string,
    context?: IntentContext
  ): Promise<CalendarIntent> {
    const startTime = Date.now();

    try {
      logger.info({ textLength: text.length }, 'Analyzing calendar intent');

      const promptContext: IntentPromptContext | undefined = context
        ? {
            timezone: context.timezone,
            currentTime: context.currentDate,
          }
        : undefined;

      const prompt = calendarIntentPrompt(text, promptContext);

      const result = await generateObject({
        model: this.model,
        schema: calendarIntentSchema as any,
        prompt: prompt,
      });

      const object = result.object as CalendarIntent;
      const duration = Date.now() - startTime;

      logger.info(
        {
          durationMs: duration,
          action: object.action,
          confidence: object.confidence,
          hasMissingFields: (object.missingFields?.length || 0) > 0,
        },
        'Intent analysis completed'
      );

      return object;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: duration,
        },
        'Intent analysis failed'
      );
      throw error;
    }
  }
}

// Export types
export type { CalendarIntent, IntentContext, IntentAction } from './types';
export { calendarIntentSchema, intentActionEnum } from './types';
export {
  runIntentPipeline,
  type IntentPipelineOptions,
  type IntentPipelineResult,
  type IntentSnapshot,
  type IntentFollowUp,
  type NormalizedIntentSnapshot,
  type IntentPromptContext,
} from './pipeline';
