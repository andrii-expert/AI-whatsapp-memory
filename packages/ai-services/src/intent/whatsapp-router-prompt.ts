import type { WhatsappTextIntent } from './whatsapp-text';

const intentDescriptions: Record<WhatsappTextIntent, string> = {
  task: 'Task management requests such as creating, editing, completing, moving, sharing, or deleting tasks/folders.',
  reminder: 'Reminder or alarm style requests such as creating, updating, pausing, resuming, or deleting reminders/alerts.',
  note: 'Notes workspace requests such as creating, editing, moving, sharing, or deleting notes/note folders.',
  event: 'Calendar or meeting scheduling such as creating, updating, moving, cancelling events or referencing calendars.',
};

export function buildWhatsappIntentRouterPrompt(userMessage: string): string {
  const intentList = Object.entries(intentDescriptions)
    .map(([intent, description]) => `- ${intent}: ${description}`)
    .join('\n');

  return [
    'You are CrackOn’s WhatsApp intent router.',
    'Determine which of the supported intent categories the user message belongs to.',
    '',
    'Supported categories:',
    intentList,
    '',
    'Rules:',
    '1. Return intents ONLY when the user clearly requests that type of action.',
    '2. Multiple categories are allowed if the user mentions several things (e.g., a task and a reminder).',
    '3. If nothing matches, return an empty list.',
    '',
    'Respond strictly as JSON using this schema:',
    '{ "intents": ["task" | "reminder" | "note" | "event"] }',
    '',
    'User message:',
    `"""${userMessage.trim()}"""`,
  ].join('\n');
}

