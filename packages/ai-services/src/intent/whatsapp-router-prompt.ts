import type { WhatsappTextIntent } from './whatsapp-text';

const intentDescriptions: Record<WhatsappTextIntent, string> = {
  task: 'Task management requests including: SHOPPING LIST (highest priority - keywords: shopping list, grocery, groceries, need to buy, things to buy), creating tasks/folders, editing tasks/folders, completing tasks, moving tasks, SHARING tasks or folders (e.g., "share task X with Y", "share folder Z with Y"), deleting tasks/folders. ANY mention of shopping list, groceries, or sharing a task/folder is a TASK intent.',
  reminder: 'Reminder or alarm style requests such as creating, updating, pausing, resuming, or deleting reminders/alerts.',
  note: 'Notes workspace requests such as creating, editing, moving, sharing, or deleting notes/note folders.',
  event: 'Calendar or meeting scheduling such as creating, updating, moving, cancelling events or referencing calendars.',
};

export function buildWhatsappIntentRouterPrompt(userMessage: string): string {
  const intentList = Object.entries(intentDescriptions)
    .map(([intent, description]) => `- ${intent}: ${description}`)
    .join('\n');

  return [
    'You are CrackOn\'s WhatsApp intent router.',
    'Determine which of the supported intent categories the user message belongs to.',
    '',
    'Supported categories:',
    intentList,
    '',
    'CRITICAL #1: Shopping List Recognition (HIGHEST PRIORITY!)',
    '• If the user mentions SHOPPING LIST, GROCERIES, NEED TO BUY, THINGS TO BUY - this is ALWAYS a TASK intent.',
    '• Shopping list has the HIGHEST priority - check for it FIRST!',
    '• Examples that are TASK intent (shopping):',
    '  - "add bread, milk, toy on shopping list" → task',
    '  - "shopping list: eggs, cheese" → task',
    '  - "I need to buy milk and bread" → task',
    '  - "groceries: apples, oranges" → task',
    '  - "add to groceries" → task',
    '',
    'CRITICAL #2: Sharing Recognition',
    '• If the user mentions SHARING a task or folder (e.g., "share task X", "share folder Y", "send task to", "give access to folder"), this is ALWAYS a TASK intent.',
    '• Examples that are TASK intent (sharing):',
    '  - "Share the Task Buy milk with Sarah" → task',
    '  - "Share my Home folder with my partner" → task',
    '  - "Send the task Contact John to Michael" → task',
    '  - "Give Tom access to the Projects folder" → task',
    '',
    'Rules:',
    '1. Return intents ONLY when the user clearly requests that type of action.',
    '2. Multiple categories are allowed if the user mentions several things (e.g., a task and a reminder).',
    '3. If nothing matches, return an empty list.',
    '4. SHOPPING LIST / GROCERIES = TASK intent (always, highest priority).',
    '5. SHARING tasks or folders = TASK intent (always).',
    '',
    'Respond strictly as JSON using this schema:',
    '{ "intents": ["task" | "reminder" | "note" | "event"] }',
    '',
    'User message:',
    `"""${userMessage.trim()}"""`,
  ].join('\n');
}

