export interface EventViewPromptOptions {
  messageHistory?: Array<{ direction: 'incoming' | 'outgoing'; content: string }>;
  currentDate?: Date;
  timezone?: string;
}

const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

export function buildEventViewAnalysisPrompt(
  userMessage: string,
  options?: EventViewPromptOptions
): string {
  const currentDate = options?.currentDate ?? new Date();
  const timezone = options?.timezone ?? DEFAULT_TIMEZONE;
  
  // Format current date for context
  const currentDateStr = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  });
  const currentTimeStr = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });

  // Build message history context if available
  let historyContext = '';
  if (options?.messageHistory && options.messageHistory.length > 0) {
    const recentMessages = options.messageHistory.slice(-5); // Last 5 messages for context
    historyContext = '\n\nRecent conversation history:\n';
    recentMessages.forEach(msg => {
      const prefix = msg.direction === 'incoming' ? 'User' : 'Assistant';
      historyContext += `${prefix}: ${msg.content}\n`;
    });
  }

  return `You are analyzing a user message to determine if they want to view details of a specific calendar event by its number.

Current date and time: ${currentDateStr} at ${currentTimeStr} (timezone: ${timezone})

User message: "${userMessage}"
${historyContext}

Analyze the user's message and determine:
1. Does the user want to view details of a specific event?
2. If yes, what event number(s) are they referring to?

Examples of event view requests:
- "show me 3" → wants to view event #3
- "show meeting info for number 3" → wants to view event #3
- "show info on 5" → wants to view event #5
- "show me 1, 2 and 3" → wants to view events #1, #2, and #3
- "show details for event 4" → wants to view event #4
- "what's event 2" → wants to view event #2
- "give me info about meeting 1" → wants to view event #1
- "send me details for number 3" → wants to view event #3

NOT event view requests:
- "show me all events" → wants to list all events (not a specific event)
- "show events today" → wants to list events (not a specific event)
- "create event" → wants to create an event (not view)
- "delete event 3" → wants to delete an event (not view)

Respond in this EXACT format (JSON):
{
  "isEventViewRequest": true/false,
  "eventNumbers": [1, 2, 3] or null,
  "reasoning": "brief explanation of your analysis"
}

If the user wants to view multiple events, include all numbers in the array.
If it's not an event view request, set "isEventViewRequest" to false and "eventNumbers" to null.
If it's an event view request but no number is specified, set "isEventViewRequest" to true and "eventNumbers" to null.

IMPORTANT: Only respond with valid JSON. Do not include any other text before or after the JSON.`;
}

