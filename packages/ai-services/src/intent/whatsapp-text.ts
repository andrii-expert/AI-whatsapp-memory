import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { buildWhatsappTaskPrompt, type TaskPromptOptions } from './task-prompts';
import { buildWhatsappReminderPrompt, type ReminderPromptOptions } from './reminder-prompts';
import { buildWhatsappNotePrompt, type NotePromptOptions } from './note-prompts';
import { buildWhatsappEventPrompt, type EventPromptOptions } from './event-prompts';

export type WhatsappTextIntent = 'task' | 'reminder' | 'note' | 'event';

export class WhatsappTextAnalysisService {
  private model = openai('gpt-4o-mini');

  async analyzeTask(text: string, options?: TaskPromptOptions): Promise<string> {
    const prompt = buildWhatsappTaskPrompt(text, options);
    return this.generate(prompt);
  }

  async analyzeReminder(text: string, options?: ReminderPromptOptions): Promise<string> {
    const prompt = buildWhatsappReminderPrompt(text, options);
    return this.generate(prompt);
  }

  async analyzeNote(text: string, options?: NotePromptOptions): Promise<string> {
    const prompt = buildWhatsappNotePrompt(text, options);
    return this.generate(prompt);
  }

  async analyzeEvent(text: string, options?: EventPromptOptions): Promise<string> {
    const prompt = buildWhatsappEventPrompt(text, options);
    return this.generate(prompt);
  }

  private async generate(prompt: string): Promise<string> {
    const result = await generateText({
      model: this.model,
      prompt,
    });

    return result.text.trim();
  }
}

