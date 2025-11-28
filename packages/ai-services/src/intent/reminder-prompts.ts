export interface ReminderPromptOptions {
  defaultStatusLabel?: string;
  messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }>;
}

const DEFAULT_STATUS = 'active';

export function buildWhatsappReminderPrompt(
  userMessage: string,
  options?: ReminderPromptOptions
): string {
  const defaultStatus = options?.defaultStatusLabel ?? DEFAULT_STATUS;

  return [
    // 'You are the CrackOn WhatsApp Reminder assistant. Interpret reminder-style messages (create, adjust, pause, resume, or delete reminders) and answer strictly with the templates below. No chit-chat, no Markdown, no emojis.',
    // '',
    // 'IMPORTANT: Be generous in interpreting user intent. If a user mentions anything that could be a reminder (e.g., "remind me to...", "don\'t forget...", "I need to..."), treat it as a CREATE action unless they explicitly say edit/delete/pause/resume.',
    // '',
    // '1. Supported reminder templates',
    // `   Create a reminder: {title} - schedule: {frequency/day/time details} - status: {active|paused}`,
    // '   Update a reminder: {existing_title} - to: {new_details}',
    // '   Delete a reminder: {title}',
    // '   Pause a reminder: {title}',
    // '   Resume a reminder: {title}',
    // '   List reminders: {filter_or_timeframe}',
    // '   Next reminder: {filter_or_timeframe}',
    // '',
    // '2. Scheduling guidance',
    // '   • Normalise times to HH:MM and keep the user’s timezone assumptions.',
    // '   • Recognise CrackOn frequencies: once, hourly, minutely, daily, weekly, monthly, yearly.',
    // '   • Capture extra parameters (daysOfWeek, targetDate, interval minutes, etc.) inside {frequency/day/time details}.',
    // '',
    // '3. Additional rules',
    // `   • If the user does not state whether the reminder should be active, default to "${defaultStatus}".`,
    // '   • Strip fillers ("uh", "umm").',
    // '   • Preserve user wording for titles, list filters, and frequency descriptions.',
    // '   • Be creative in interpreting intent - if someone says "remind me about X" or "don\'t forget Y", create a reminder.',
    // '   • Only use fallback if there is genuinely NO reminder-related intent: I\'m sorry, I didn\'t understand. Could you rephrase?',
    // '',
    '═══════════════════════════════════════════════════════════════',
    'CONVERSATION HISTORY (for context)',
    '═══════════════════════════════════════════════════════════════',
    '',
    ...(options?.messageHistory && options.messageHistory.length > 0
      ? [
          'The following is the recent conversation history. Use this to understand context and references:',
          '',
          ...options.messageHistory.map((msg) => {
            const role = msg.direction === 'incoming' ? 'User' : 'Assistant';
            return `${role}: ${msg.content}`;
          }),
          '',
          'Current user message:',
        ]
      : ['Current user message:']),
    '',
    `"""${userMessage.trim()}"""`,
  ].join('\n');
}

