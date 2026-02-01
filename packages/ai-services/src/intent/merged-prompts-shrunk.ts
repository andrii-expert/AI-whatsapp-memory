/**
 * Condensed domain-specific prompts for faster AI responses.
 * Used when the router detects a single clear domain (saves ~60-70% tokens).
 */
import { formatDateToLocalLabel } from '../utils/timezone';

interface ShrunkPromptOptions {
  messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }>;
  currentDate?: Date;
  timezone?: string;
  defaultStatusLabel?: string;
  defaultCalendarLabel?: string;
}

function buildHistoryAndMessage(options: ShrunkPromptOptions | undefined, userMessage: string): string[] {
  const currentLabel = formatDateToLocalLabel(
    options?.currentDate ?? new Date(),
    options?.timezone ?? 'Africa/Johannesburg'
  );

  const historyPart =
    options?.messageHistory && options.messageHistory.length > 0
      ? (() => {
          const pairs: Array<{ user: string; assistant?: string }> = [];
          let currentPair: { user: string; assistant?: string } | null = null;
          for (const msg of options.messageHistory!) {
            if (msg.direction === 'incoming') {
              if (currentPair && currentPair.user) pairs.push(currentPair);
              currentPair = { user: msg.content };
            } else if (msg.direction === 'outgoing' && currentPair) {
              currentPair.assistant = msg.content;
            }
          }
          if (currentPair?.user) pairs.push(currentPair);
          return [
            'Recent conversation:',
            '',
            ...pairs.map(
              (p, i) =>
                `--- Exchange ${i + 1} ---\nUser: ${p.user}\nAssistant: ${p.assistant || '(Awaiting response)'}`
            ),
            '',
            'CURRENT USER MESSAGE (analyze this):',
            '',
            `"""${userMessage.trim()}"""`,
          ];
        })()
      : ['CURRENT USER MESSAGE:', '', `"""${userMessage.trim()}"""`];

  return historyPart;
}

export function buildShrunkShoppingPrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const currentLabel = formatDateToLocalLabel(
    options?.currentDate ?? new Date(),
    options?.timezone ?? 'Africa/Johannesburg'
  );

  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about SHOPPING LIST. Use Title: shopping.',
    '',
    `Current date/time: ${currentLabel}`,
    '',
    '═══════════════════════════════════════════════════════════════',
    'SHOPPING LIST - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CREATE: Create a shopping item: {name} or Create a shopping item: {name} - on folder: {folder}',
    '  • One line per item. Items before/after keywords. Parse commas, "and", line breaks.',
    '  • "add milk" → Create a shopping item: Milk',
    '  • "add milk, bread to groceries" → Create a shopping item: Milk - on folder: Groceries\n  Create a shopping item: Bread - on folder: Groceries',
    '  • Category optional: - category: {Dairy|Produce|...}',
    '',
    'LIST: List shopping items: {folder|all} - status: {open|completed|all}',
    '  • "show my list" → List shopping items: all - status: all',
    '  • "show groceries" → List shopping items: Groceries - status: all',
    '',
    'COMPLETE: Complete a shopping item: {name} - on folder: {folder}',
    'DELETE: Delete a shopping item: {name} or Delete shopping items: {numbers} (plural for numbers, NO folder)',
    '  • "delete 5,6" after listing → Delete shopping items: 5,6',
    'EDIT: Edit a shopping item: {name} - to: {new} - on folder: {folder}',
    '',
    'FOLDERS: Create/Edit/Delete a shopping list folder, Share a shopping list folder, Remove share',
    '  • "share groceries with family" → Share a shopping list folder: Groceries - with: Family - permission: view',
    '  • "create Home list" → Create a shopping list folder: Home list',
    '  • "change Paul to Primary list" → Set primary list: Paul',
    '  • "move milk to Groceries" → Move a shopping item: Milk - to folder: Groceries',
    '',
    'OUTPUT: Start with "Title: shopping" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}

export function buildShrunkReminderPrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const defaultStatus = options?.defaultStatusLabel ?? 'active';
  const currentLabel = formatDateToLocalLabel(
    options?.currentDate ?? new Date(),
    options?.timezone ?? 'Africa/Johannesburg'
  );

  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about REMINDERS. Use Title: reminder.',
    '',
    `Current date/time: ${currentLabel}`,
    '',
    '═══════════════════════════════════════════════════════════════',
    'REMINDER - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    `CREATE: Create a reminder: {title} - schedule: {time} - status: {active|paused} (default: ${defaultStatus}) - category: {category}`,
    '  • Schedule: "at 5pm", "tomorrow at 10am", "every day at 9am", "on the 30th of each month"',
    '  • NEVER use 24h in schedule - use "10am" not "10:00"',
    '  • Categories: General, Birthdays, Family & Home, Work and Business, Health and Wellness, Errands, Travel, Notes',
    '  • Convert relative dates to specific (tomorrow → on 25th January) for output',
    '',
    'UPDATE: Update a reminder: {title} - to: {changes}',
    '  • "delay" → to: delay. "change to 10 min" → to: change to in 10 minutes',
    '',
    'DELETE: Delete a reminder: {title} or Delete all reminders or Delete a reminder: all old',
    '  • all old = passed/expired/paused (same thing)',
    '',
    'LIST: List reminders: {today|tomorrow|all|timeframe} - status: {active|paused|all}',
    '',
    'OUTPUT: Start with "Title: reminder" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}

export function buildShrunkEventPrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const defaultCalendar = options?.defaultCalendarLabel ?? 'primary';
  const currentLabel = formatDateToLocalLabel(
    options?.currentDate ?? new Date(),
    options?.timezone ?? 'Africa/Johannesburg'
  );

  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about CALENDAR EVENTS. Use Title: event.',
    '',
    `Current date/time: ${currentLabel}`,
    '',
    '═══════════════════════════════════════════════════════════════',
    'EVENT - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CREATE: Create an event: {title} - date: {ddth Month} - time: {HH:MM or range} - calendar: primary',
    '  • Convert ALL relative dates to specific (tomorrow → 25th January)',
    '  • "create meeting X" = ALWAYS Create, never Update even if X exists',
    '',
    'UPDATE: Update an event: {title} - changes: {details} - calendar: primary',
    '  • Only when user says edit/update/change/reschedule',
    '',
    'DELETE: Delete an event: {title} - calendar: primary',
    '',
    'LIST: List events: {today|tomorrow|all|4th Feb} - calendar: primary',
    '  • "show events" (plural) → List. "show event 5" (singular) → Show event details: 5',
    '',
    'OUTPUT: Start with "Title: event" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}

export function buildShrunkDocumentPrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about DOCUMENTS/FILES. Use Title: document.',
    '',
    '═══════════════════════════════════════════════════════════════',
    'DOCUMENT - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CREATE: Create a file: {name} - on folder: {folder}',
    'LIST: List files: {folder|all}',
    'VIEW: View a file: {name} - on folder: {folder}',
    'EDIT: Edit a file: {name} - to: {new} - on folder: {folder}',
    'DELETE: Delete a file: {name} - on folder: {folder}',
    'SHARE: Share a file: {name} - with: {recipient} - on folder: {folder}',
    '',
    'OUTPUT: Start with "Title: document" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}

export function buildShrunkFriendPrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about FRIENDS/CONTACTS. Use Title: friend.',
    '',
    '═══════════════════════════════════════════════════════════════',
    'FRIEND - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CREATE: Create a friend: {name} - email: {email} - phone: {phone} - folder: {folder}',
    'UPDATE: Update a friend: {name} - changes: {field to value}',
    'DELETE: Delete a friend: {name}',
    'LIST: List friends: {all|folder}',
    '',
    'OUTPUT: Start with "Title: friend" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}

export function buildShrunkNotePrompt(
  userMessage: string,
  options?: ShrunkPromptOptions
): string {
  const lines = [
    'You are the CrackOn WhatsApp Assistant. This message is about NOTES. Use Title: note.',
    '',
    '═══════════════════════════════════════════════════════════════',
    'NOTE - OPERATIONS',
    '═══════════════════════════════════════════════════════════════',
    '',
    'CREATE: Create a note: {title} - folder: {path} - content: {summary}',
    'UPDATE: Update a note: {title} - changes: {details} - folder: {path}',
    'DELETE: Delete a note: {title} - folder: {path}',
    'LIST: List notes: {path|all}',
    '',
    'OUTPUT: Start with "Title: note" then the action template. No explanations.',
  ];

  return [...lines, '', ...buildHistoryAndMessage(options, userMessage)].join('\n');
}
