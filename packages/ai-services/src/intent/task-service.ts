// Task Intent Analysis Service using AI SDK
// Extracts task-related intents from user messages

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { taskIntentPrompt, type TaskIntentPromptContext } from './task-prompts';
import { taskIntentSchema } from './task-types';
import type { TaskIntent } from './task-types';

export class TaskIntentAnalysisService {
  private model = openai('gpt-4o-mini'); // Fast and cost-effective

  async analyzeTaskIntent(
    text: string,
    context?: TaskIntentPromptContext
  ): Promise<TaskIntent> {
    const startTime = Date.now();

    try {
      logger.info({ textLength: text.length }, 'Analyzing task intent');

      const prompt = taskIntentPrompt(text, context);

      const result = await generateObject({
        model: this.model,
        schema: taskIntentSchema as any,
        prompt: prompt,
      });

      const object = result.object as TaskIntent;
      const duration = Date.now() - startTime;

      logger.info(
        {
          durationMs: duration,
          intentType: object.intentType,
          action: object.action,
          confidence: object.confidence,
          hasMissingFields: (object.missingFields?.length || 0) > 0,
        },
        'Task intent analysis completed'
      );

      return object;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          durationMs: duration,
        },
        'Task intent analysis failed'
      );
      throw error;
    }
  }
}

// Export types
export type { TaskIntent, TaskIntentPromptContext } from './task-types';

