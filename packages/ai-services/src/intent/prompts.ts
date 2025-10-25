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

### Instructions
1. Identify the user's desired calendar action (CREATE, UPDATE, DELETE, QUERY).
2. Extract available details conservatively; never guess. If information is ambiguous, leave it null and add a follow-up entry only for the required fields. Use values from the Clarification Responses section above to fill in any fields that were previously answered.
3. Normalise date/time information. If only a day or part of a day is mentioned, mark the precision accordingly. Treat provided timestamps as the actual scheduled time; do not apply any conversions. When generating datetime.iso, express the user's intended local time directly (e.g., if they say "tomorrow at 1pm", and tomorrow is Oct 23, use "2025-10-23T13:00:00.000Z").
4. Attendees should reference the contact roster when possible (match by name). IMPORTANT: If the user says "myself", "me", "just me", "only me", "just myself", or similar self-referencing phrases, interpret this as NO attendees (return empty array []). Only include attendees who are OTHER PEOPLE with real names and email addresses from the contact roster. If an attendee is mentioned but not in the contact roster, add them to followUp to ask for clarification.
5. Locations should specify whether they are physical, virtual, or unknown. URLs count as virtual locations.
6. Confidence must reflect how certain the assistant is (0.0–1.0). Lower confidence should trigger follow-up questions.
7. CRITICAL: For CREATE/UPDATE actions, the final intent MUST include a non-empty "title" and a precise "datetime.iso". Use the user's stated local time directly (no conversions). If either is missing or unclear, add a follow-up question explaining exactly what is required.
8. All other fields (durationMinutes, attendees, location, description, etc.) are optional. Populate them when the user supplies the information, but do not request clarifications for them if they are absent. Populate the followUp array only for title/date/time gaps or when resolving conflicts explicitly mentioned by the user.
9. When a field is unavailable, output JSON null (without quotes). If there is no scheduling conflict, set "conflict": null. Never emit the string "null" for missing values.

Return only the JSON object that matches the agreed schema.`;
}
