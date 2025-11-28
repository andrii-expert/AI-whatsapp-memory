import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { buildWhatsappTaskPrompt, type TaskPromptOptions } from './task-prompts';
import { buildWhatsappReminderPrompt, type ReminderPromptOptions } from './reminder-prompts';
import { buildWhatsappNotePrompt, type NotePromptOptions } from './note-prompts';
import { buildWhatsappEventPrompt, type EventPromptOptions } from './event-prompts';
import { buildMergedWhatsappPrompt, type MergedPromptOptions } from './merged-prompts';

export type WhatsappTextIntent = 'task' | 'reminder' | 'note' | 'event';

export class WhatsappTextAnalysisService {
  private model;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error({}, 'OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY environment variable is required. Please set it in your environment.');
    }

    // Create OpenAI client with explicit API key configuration
    const openaiClient = createOpenAI({
      apiKey: apiKey,
    });

    this.model = openaiClient('gpt-4o-mini');
    
    logger.debug({}, 'WhatsappTextAnalysisService initialized with OpenAI API key');
  }

  /**
   * Analyze message using merged prompt (recommended - handles all types)
   */
  async analyzeMessage(text: string, options?: MergedPromptOptions): Promise<string> {
    const prompt = buildMergedWhatsappPrompt(text, options);
    return this.generate(prompt, 'merged');
  }

  async analyzeTask(text: string, options?: TaskPromptOptions & { messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }> }): Promise<string> {
    const prompt = buildWhatsappTaskPrompt(text, options);
    return this.generate(prompt, 'task');
  }

  async analyzeReminder(text: string, options?: ReminderPromptOptions & { messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }> }): Promise<string> {
    const prompt = buildWhatsappReminderPrompt(text, options);
    return this.generate(prompt, 'reminder');
  }

  async analyzeNote(text: string, options?: NotePromptOptions & { messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }> }): Promise<string> {
    const prompt = buildWhatsappNotePrompt(text, options);
    return this.generate(prompt, 'note');
  }

  async analyzeEvent(text: string, options?: EventPromptOptions & { messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }> }): Promise<string> {
    const prompt = buildWhatsappEventPrompt(text, options);
    return this.generate(prompt, 'event');
  }

  private async generate(prompt: string, intent: string): Promise<string> {
    try {
      logger.debug(
        {
          intent,
          promptLength: prompt.length,
          promptPreview: prompt.substring(0, 200),
        },
        'Calling OpenAI API'
      );

      const result = await generateText({
        model: this.model,
        prompt,
        temperature: 0.2, // Lower temperature for more consistent, template-following responses
      });

      const response = result.text.trim();
      
      logger.info(
        {
          intent,
          responseLength: response.length,
          responsePreview: response.substring(0, 200),
          usage: result.usage,
        },
        'OpenAI response generated successfully'
      );

      if (!response || response.length === 0) {
        logger.warn({ intent }, 'OpenAI returned empty response');
        throw new Error('OpenAI returned an empty response');
      }

      return response;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(
        {
          error: errorMessage,
          intent,
          promptLength: prompt.length,
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'OpenAI API call failed'
      );
      
      // Check for specific API key errors
      if (errorMessage.includes('API key') || errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        throw new Error(
          `OpenAI API key is invalid or missing. Please check your OPENAI_API_KEY environment variable.`
        );
      }
      
      // Re-throw with more context
      throw new Error(
        `OpenAI API error for ${intent}: ${errorMessage}`
      );
    }
  }
}

