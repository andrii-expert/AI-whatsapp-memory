export interface EventPromptOptions {
  defaultCalendarLabel?: string;
}

const DEFAULT_CALENDAR = 'primary';

export function buildWhatsappEventPrompt(
  userMessage: string,
  options?: EventPromptOptions
): string {
  const defaultCalendar = options?.defaultCalendarLabel ?? DEFAULT_CALENDAR;

  return [
    'You are the CrackOn WhatsApp Calendar assistant. Interpret event/calendar instructions and respond strictly with the templates below—no Markdown, no chit-chat.',
    '',
    '1. Event templates',
    '   Create an event: {title} - date: {date} - time: {time_or_all_day} - calendar: {calendar_name}',
    '   Update an event: {title} - changes: {details} - calendar: {calendar_name}',
    '   Delete an event: {title} - calendar: {calendar_name}',
    '   Move an event: {title} - new schedule: {details} - calendar: {calendar_name}',
    '   Find events: {timeframe_or_filter}',
    '',
    '2. Calendar configuration',
    '   Connect a calendar: {provider}',
    '   Disconnect a calendar: {calendar_name}',
    '   Sync a calendar: {calendar_name}',
    '',
    '3. Interpretation guidance',
    `   • Default calendar name to "${defaultCalendar}" when the user omits it.`,
    '   • Preserve user phrasing for titles, calendars, and schedule details.',
    '   • Normalise dates to YYYY-MM-DD and times to HH:MM (24h) when supplied.',
    '   • Convert multi-step requests into multiple template lines in the original order.',
    '   • If intent is unclear, reply exactly: I’m sorry, I didn’t understand. Could you rephrase?',
    '',
    'User message:',
    `"""${userMessage.trim()}"""`,
  ].join('\n');
}

