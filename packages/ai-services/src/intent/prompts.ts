import { formatDateToLocalLabel } from '../utils/timezone';

export interface IntentPromptContext {
  timezone?: string;
  currentTime?: Date;
  contactRoster?: Array<{
    name: string;
    email?: string | null;
    relationship?: string | null;
  }>;
  recentEvents?: Array<{
    title: string;
    start: string;
    end?: string | null;
    attendees?: string[];
  }>;
  clarifications?: Array<{
    field: string;
    value: string;
    source?: string;
  }>;
}

export function calendarIntentPrompt(
  text: string,
  context?: IntentPromptContext
): string {
  const timezone = context?.timezone ?? 'Africa/Johannesburg';
  const currentDate = context?.currentTime ?? new Date();
  const currentLabel = formatDateToLocalLabel(currentDate, timezone);

  const contactRoster = (context?.contactRoster ?? [])
    .slice(0, 20)
    .map((contact, index) => {
      const email = contact.email ? contact.email : 'unknown';
      const relationship = contact.relationship ? contact.relationship : 'unspecified';
      return `${index + 1}. ${contact.name} — ${email} (${relationship})`;
    })
    .join('\n');

  const recentEvents = (context?.recentEvents ?? [])
    .slice(0, 25)
    .map((event, index) => {
      const attendees = event.attendees?.length ? event.attendees.join(', ') : 'none';
      const endLabel = event.end ? ` → ${event.end}` : '';
      return `${index + 1}. ${event.title} — ${event.start}${endLabel} | attendees: ${attendees}`;
    })
    .join('\n');

  const contactSection = contactRoster
    ? `\n### Contact Roster (top ${Math.min(20, context?.contactRoster?.length ?? 0)})\n${contactRoster}`
    : '';

  const eventsSection = recentEvents
    ? `\n### Recent Events (±7 days)\n${recentEvents}`
    : '';

  const clarificationSection = (context?.clarifications ?? [])
    .map((item, index) => {
      const source = item.source ? ` (${item.source})` : '';
      return `${index + 1}. ${item.field}${source}: ${item.value}`;
    })
    .join('\n');

  const clarificationsBlock = clarificationSection
    ? `\n### Clarification Responses\n${clarificationSection}`
    : '';

  return `You are ImagineCalendar's WhatsApp assistant. Analyse the user's message and output a structured intent strictly following the schema provided.

### Current Context
- Current local date/time: ${currentLabel}

${contactSection}
${eventsSection}
${clarificationsBlock}

### User Message
"""${text}"""

### Action Recognition Guide

**CREATE Actions** - User wants to create a new calendar event/meeting:
- Keywords: "create", "add", "new", "schedule", "set up", "put", "make", "book"
- Also CREATE if user mentions a meeting/event without explicit action words (e.g., "meeting with John at 2pm")
- Examples:
  • "Create a calendar event: Meeting with John at 2pm"
  • "Add a meeting on Friday at 10am"
  • "New event: Team meeting tomorrow morning"
  • "Meeting with Sarah at 1pm" (implicit CREATE)
  • "Set up a meeting for next Monday at 11am"
  • "Can you add a meeting for me? Tomorrow 4pm"
  • "Hey… add a meeting for me… Friday at 2pm with John" (voice-note style)
  • "Meeting Friday at 9 — add it" (casual)

**UPDATE Actions** - User wants to modify an existing event:
- Keywords: "edit", "update", "change", "modify", "reschedule", "move", "shift"
- "Reschedule" and "move" are UPDATE actions, not DELETE
- Examples:
  • "Edit my meeting with John to 3pm"
  • "Change the Budget Review event to next Tuesday"
  • "Update the meeting title to Strategy Session"
  • "Reschedule the meeting to Thursday at 11am"
  • "Move my 2pm meeting to 4pm"
  • "Can you update my event tomorrow? Make it 10am instead"
  • "Hey… update that meeting… the John one… move it to 3" (voice-note style)

**DELETE Actions** - User wants to cancel/remove an event:
- Keywords: "delete", "cancel", "remove", "drop"
- Examples:
  • "Cancel the meeting with John"
  • "Delete the event tomorrow at 10am"
  • "Remove my 3pm client call"
  • "I don't need that meeting anymore — cancel it"
  • "Hey… cancel that meeting — the one at 2" (voice-note style)

**QUERY Actions** - User wants to view/list their schedule:
- Keywords: "show", "list", "view", "display", "what's", "what are", "tell me", "see", "get"
- For QUERY, set queryTimeframe field:
  - "today" → queryTimeframe = "today"
  - "tomorrow" → queryTimeframe = "tomorrow"
  - "this week" → queryTimeframe = "this_week"
  - "this month" → queryTimeframe = "this_month"
  - "all" or no timeframe → queryTimeframe = "all" or leave null
- Also set startDate for additional context (today = current date, this week = start of week, etc.)
- Examples:
  • "Show me my schedule" → action: QUERY, queryTimeframe: "all"
  • "View my calendar" → action: QUERY, queryTimeframe: "all"
  • "What's on my calendar today?" → action: QUERY, queryTimeframe: "today"
  • "Show me today's events" → action: QUERY, queryTimeframe: "today"
  • "List my meetings today" → action: QUERY, queryTimeframe: "today"
  • "What do I have planned for today?" → action: QUERY, queryTimeframe: "today"
  • "Show my events for this week" → action: QUERY, queryTimeframe: "this_week"
  • "What's happening tomorrow?" → action: QUERY, queryTimeframe: "tomorrow"
  • "Hey… what's on my schedule?" → action: QUERY, queryTimeframe: "all" (voice-note style)

### Instructions
1. **Action Identification**: Determine if the user wants to CREATE, UPDATE, DELETE, or QUERY based on the guide above. Be generous in interpreting CREATE - if user mentions a meeting/event without explicit action words, treat as CREATE.

2. **Date/Time Extraction**:
   - For CREATE/UPDATE: Extract startDate (YYYY-MM-DD) and startTime (HH:MM) from the message
   - Relative dates: "today" = current date, "tomorrow" = current date + 1 day, "Friday" = next Friday, "next Monday" = Monday of next week
   - Time formats: Accept "2pm", "14:00", "2:00 PM", "14:30", etc. Convert to 24-hour HH:MM format
   - For QUERY: Set queryTimeframe field ("today", "tomorrow", "this_week", "this_month", "all"). Also set startDate for context.

3. **Title Extraction**:
   - Extract event title from the message. If user says "meeting with John", title could be "Meeting with John"
   - For UPDATE/DELETE: Use targetEventTitle to identify which event to modify
   - If title is unclear, leave null and add to missingFields

4. **Attendees**:
   - Match names from contact roster when possible
   - If user says "myself", "me", "just me", "only me", "just myself" → return empty array []
   - Only include OTHER PEOPLE with real names from contact roster
   - If attendee mentioned but not in roster, add to missingFields

5. **Location**:
   - Extract location text as-is (e.g., "at the office", "Café Mio", "Zoom", "Home Affairs")
   - URLs count as virtual locations

6. **UPDATE vs DELETE**:
   - "Reschedule", "move", "shift" → UPDATE action (not DELETE)
   - "Cancel", "delete", "remove" → DELETE action
   - For UPDATE: Use targetEventTitle/targetEventDate to identify the event, then use title/startDate/startTime for the new values

7. **QUERY Operations**:
   - When user asks to view/list/show schedule → action = QUERY
   - Extract timeframe and set queryTimeframe field: "today" → "today", "tomorrow" → "tomorrow", "this week" → "this_week", "this month" → "this_month", or "all" for all events
   - Also set startDate based on timeframe (today = current date, this week = start of week, etc.) for additional context
   - For "show my schedule" without timeframe → set queryTimeframe to "all" or leave null

8. **Confidence**:
   - High confidence (0.8-1.0): Clear intent with all required fields
   - Medium confidence (0.5-0.7): Intent clear but some details missing
   - Low confidence (<0.5): Ambiguous intent, add to missingFields

9. **Required Fields**:
   - CREATE: title and startDate are required (startTime recommended but can be all-day)
   - UPDATE: targetEventTitle or targetEventDate required to identify event
   - DELETE: targetEventTitle or targetEventDate required to identify event
   - QUERY: No required fields, but startDate helps filter results

10. **Missing Fields**:
    - Only add to missingFields if the field is REQUIRED and missing
    - For CREATE: title, startDate are required
    - For UPDATE/DELETE: targetEventTitle or targetEventDate required
    - Optional fields (location, attendees, description) should NOT be in missingFields

11. **Null Values**: When a field is unavailable, output JSON null (without quotes). Never emit the string "null".

Return only the JSON object that matches the agreed schema.`;
}
