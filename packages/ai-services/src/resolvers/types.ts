// Resolver types and interfaces

export interface ContactMatch {
  name: string;
  email: string;
  source: 'google' | 'microsoft';
}

export interface ContactResolutionResult {
  resolved: Record<string, string>; // name → email
  ambiguous: Array<{
    name: string;
    matches: ContactMatch[];
    question: string;
  }>;
  notFound: string[]; // Names with no matches
  needsClarification: boolean;
}

export interface EventMatch {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendarId: string;
  score: number; // 0-1 match confidence
}

export interface EventMatchResult {
  matches: EventMatch[];
  needsClarification: boolean;
  question?: string;
}

export interface ConflictInfo {
  hasConflict: boolean;
  conflicts: Array<{
    eventId: string;
    title: string;
    start: Date;
    end: Date;
  }>;
  suggestion?: string; // e.g., "Move to 3:30pm?"
}

export interface TimeResolutionResult {
  time: string; // HH:MM format
  needsClarification: boolean;
  question?: string;
  suggestions?: string[]; // e.g., ["9am", "2pm", "5pm"]
}

export interface CalendarSelectionResult {
  calendarId: string;
  calendarName: string;
  needsClarification: boolean;
  availableCalendars?: Array<{
    id: string;
    name: string;
    isPrimary: boolean;
  }>;
}
