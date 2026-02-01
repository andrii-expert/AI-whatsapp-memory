/**
 * Lightweight keyword-based router to shrink the merged prompt.
 * Returns which domain sections to include. No API calls - pure string matching.
 * When confident in 1 domain, only that section is sent (saving ~60-70% tokens).
 * When uncertain, returns 'all' for full prompt (maintains functionality).
 */
export type RoutedDomain = 'shopping' | 'reminder' | 'event' | 'document' | 'friend' | 'note' | 'dashboard' | 'all';

const SHOPPING_PATTERNS = [
  /\b(list|lists)\b/i,
  /\b(shopping|grocery|groceries)\b/i,
  /\b(add|buy|get)\s+(milk|bread|eggs|cheese|butter|toilet paper|soap)/i,
  /\b(add|buy|get)\s+.*\s+(to|on)\s+(list|shopping)/i,
  /\b(to|on)\s+(my\s+)?(shopping\s+)?list\b/i,
  /\b(shopping\s+)?list\s*:?\s*\w/i,
  /\bneed\s+to\s+(buy|get)/i,
  /\bthings?\s+to\s+buy\b/i,
  /\bpick\s+up\s+(milk|bread|eggs|some\s+\w+)/i,
  /\bmark\s+(milk|bread|\w+)\s+as\s+(bought|done)/i,
  /\b(drink|grocery|home)\s+list\b/i,
  /\bshare\s+.*\s+list\s+with\b/i,
  /\bprimary\s+list\b/i,
  /\bmove\s+\w+\s+to\s+\w+\s+list\b/i,
  /\bdelete\s+shopping\s+items?\b/i,
];

const REMINDER_PATTERNS = [
  /\bremind\s+me\b/i,
  /\b(reminder|reminders)\b/i,
  /\bdon'?t\s+(let\s+me\s+)?forget\b/i,
  /\b(create|set|add)\s+reminder\b/i,
  /\b(alert|nudge|ping)\s+me\b/i,
  /\blist\s+reminders?\b/i,
  /\b(show|what)\s+reminders?\b/i,
  /\b(pause|resume|delay)\s+(all\s+)?reminders?\b/i,
  /\bdelete\s+(all\s+)?(old|past|expired|paused)\s+reminders?\b/i,
  /\b(feed|water|walk|pick\s+up|call|send|pay)\s+(the\s+)?(dogs?|kids?|plants?|mom|dad)\b/i,
  /\bremind\s+me\s+to\b/i,
  /\b(today|tomorrow|this\s+week)'?s?\s+reminders?\b/i,
  /\bbirthday\s+(reminder)?\b/i,
];

const EVENT_PATTERNS = [
  /\b(meeting|meetings)\b/i,
  /\b(meet|meeting)\s+with\b/i,
  /\b(appointment|appointments)\b/i,
  /\b(event|events)\b/i,
  /\b(schedule|scheduled)\b/i,
  /\b(calendar)\b/i,
  /\bcreate\s+(a\s+)?(event|meeting)\b/i,
  /\b(add|set\s+up|book)\s+(a\s+)?(meeting|event)\b/i,
  /\blist\s+events?\b/i,
  /\b(show|what)\s+events?\b/i,
  /\bshow\s+event\s+\d+\b/i,
  /\b(zoom|google\s+meet|teams)\b/i,
  /\b(boardroom|office|at\s+home)\s+(at|for)\b/i,
  /\b(from|to)\s+\d{1,2}:\d{2}\s+(to|-)\s+\d{1,2}:\d{2}\b/i,
  /\bfor\s+\d+\s+(minute|hour)s?\b/i,
];

const DOCUMENT_PATTERNS = [
  /\b(file|files)\b/i,
  /\b(document|documents)\b/i,
  /\b(upload|uploaded)\b/i,
  /\b(pdf|docx?|spreadsheet)\b/i,
  /\bsave\s+(this\s+)?(as|document)\b/i,
  /\blist\s+(files|documents)\b/i,
  /\b(show|what)\s+(files|documents)\b/i,
  /\bshare\s+(file|document|folder)\b/i,
  /\bcreate\s+(a\s+)?(file|document)\s+folder\b/i,
];

const FRIEND_PATTERNS = [
  /\b(friend|friends)\b/i,
  /\b(contact|contacts)\b/i,
  /\b(add|create)\s+(friend|contact)\b/i,
  /\blist\s+(friends|contacts)\b/i,
  /\b(show|what)\s+friends?\b/i,
  /\bfriend\s+folder\b/i,
];

const NOTE_PATTERNS = [
  /\b(note|notes)\b/i,
  /\bcreate\s+note\b/i,
  /\blist\s+notes\b/i,
];

const DASHBOARD_PATTERNS = [
  /\bdashboard\b/i,
  /\b(show|open|view|access)\s+(my\s+)?dashboard\b/i,
];

/**
 * Route user message to domain(s). Returns 'all' when ambiguous to maintain functionality.
 */
export function routeMessageToDomains(message: string): RoutedDomain[] {
  const m = message.trim();
  if (!m || m.length < 2) return ['all'];

  const lower = m.toLowerCase();
  const domains: Set<RoutedDomain> = new Set();

  // Dashboard - high priority, short message
  if (DASHBOARD_PATTERNS.some((p) => p.test(m))) {
    return ['dashboard'];
  }

  // Shopping - highest priority per prompt rules (list without type = shopping)
  const hasShopping = SHOPPING_PATTERNS.some((p) => p.test(m));
  const hasReminder = REMINDER_PATTERNS.some((p) => p.test(m));
  const hasEvent = EVENT_PATTERNS.some((p) => p.test(m));
  const hasDocument = DOCUMENT_PATTERNS.some((p) => p.test(m));
  const hasFriend = FRIEND_PATTERNS.some((p) => p.test(m));
  const hasNote = NOTE_PATTERNS.some((p) => p.test(m));

  // Ambiguous "list" - could be list reminders, list events, list items, list notes
  const hasListWord = /\blist\b/i.test(m) || /\blists\b/i.test(m);
  const hasShowMy = /\b(show|what)'?s?\s+(on\s+)?(my\s+)?/i.test(m);
  const hasAddTo = /\b(add|put)\s+.*\s+(to|on|in)\s+(my\s+)?(the\s+)?/i.test(m);

  // "list" or "lists" without other context often = shopping (per prompt: default to shopping)
  const listOnlyShopping = (hasListWord || hasShowMy) && !hasReminder && !hasEvent && !hasDocument && !hasNote;
  if (hasShopping || listOnlyShopping) domains.add('shopping');
  if (hasReminder) domains.add('reminder');
  if (hasEvent) domains.add('event');
  if (hasDocument) domains.add('document');
  if (hasFriend) domains.add('friend');
  if (hasNote) domains.add('note');

  // Very short messages (hello, hi, etc.) or greeting-like -> all
  if (m.length < 15 && /^(hi|hey|hello|hey[,\s]|thanks|thank you|ok|okay|yes|no|what|how)/i.test(m)) {
    return ['all'];
  }

  // Ambiguous: "add milk" could be shopping; "delete 1" needs history; "change it" needs history
  const needsHistory = /\b(it|that|this|them)\b/i.test(m) || /\bdelete\s+\d+\b/i.test(m) || /\bchange\s+it\b/i.test(m);
  if (needsHistory) return ['all'];

  // Multiple domains detected -> include all relevant, but that might mean full prompt
  const count = domains.size;
  if (count === 0) return ['all'];
  if (count >= 2) return ['all']; // Multiple intents = use full prompt to get disambiguation right

  // Single domain with high confidence
  return Array.from(domains);
}

/**
 * Should we use the shrunk prompt? True when we have exactly one domain.
 */
export function shouldUseShrunkPrompt(domains: RoutedDomain[]): boolean {
  return domains.length === 1 && domains[0] !== 'all' && domains[0] !== 'dashboard';
}
