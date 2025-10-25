// Resolution Pipeline Orchestrator
// Coordinates all resolvers to complete the intent

import { logger } from '@imaginecalendar/logger';
import type { CalendarIntent } from '../intent/types';
import { ContactResolver } from './contact-resolver';
import type {
  ContactResolutionResult,
  EventMatchResult,
  ConflictInfo,
  TimeResolutionResult,
  CalendarSelectionResult,
} from './types';

export interface ResolutionContext {
  userId: string;
  timezone: string;
  currentDate: Date;
}

export interface ResolutionResult {
  isComplete: boolean;
  intent: CalendarIntent;

  // Resolution results
  contactResolution?: ContactResolutionResult;
  eventMatch?: EventMatchResult;
  conflicts?: ConflictInfo;

  // What still needs clarification
  pendingClarifications: Array<{
    type: 'contact' | 'time' | 'event_match' | 'conflict' | 'calendar';
    question: string;
    options?: string[];
  }>;

  // Question to ask user (if not complete)
  nextQuestion?: string;
}

export class ResolutionPipeline {
  constructor(
    private contactResolver?: ContactResolver
    // More resolvers will be added here
  ) {}

  async resolve(
    intent: CalendarIntent,
    context: ResolutionContext
  ): Promise<ResolutionResult> {
    const result: ResolutionResult = {
      isComplete: false,
      intent,
      pendingClarifications: [],
    };

    logger.info(
      {
        userId: context.userId,
        action: intent.action,
        hasAttendees: (intent.attendees?.length || 0) > 0,
      },
      'Starting resolution pipeline'
    );

    // Step 1: Resolve contacts (if attendees present)
    if (intent.attendees && intent.attendees.length > 0 && this.contactResolver) {
      logger.info({ attendees: intent.attendees }, 'Resolving contacts');

      result.contactResolution = await this.contactResolver.resolve(
        context.userId,
        intent.attendees
      );

      if (result.contactResolution.needsClarification) {
        // Add clarifications for each ambiguous/missing contact
        for (const amb of result.contactResolution.ambiguous) {
          result.pendingClarifications.push({
            type: 'contact',
            question: amb.question,
            options: amb.matches.map(m => `${m.name} (${m.email})`),
          });
        }

        for (const notFound of result.contactResolution.notFound) {
          result.pendingClarifications.push({
            type: 'contact',
            question: `We couldn't find "${notFound}" in your contacts. What's their email address?`,
          });
        }
      } else {
        // Update intent with resolved emails
        intent.attendees = Object.values(result.contactResolution.resolved);
      }
    }

    // Step 2: Check for missing critical fields
    if (intent.action === 'CREATE') {
      if (!intent.title) {
        result.pendingClarifications.push({
          type: 'event_match',
          question: "What should we call this event?",
        });
      }

      if (!intent.startDate) {
        result.pendingClarifications.push({
          type: 'time',
          question: "When would you like to schedule this?",
        });
      }

      if (!intent.startTime && !intent.isAllDay) {
        result.pendingClarifications.push({
          type: 'time',
          question: `What time on ${intent.startDate || 'that day'} would you like to set the meeting for?`,
        });
      }
    }

    // Step 3: For UPDATE/DELETE, we'd need to match the existing event
    // TODO: Implement event matcher when we build it

    // Step 4: Check for conflicts (once we have all details)
    // TODO: Implement conflict detector

    // Determine if we're complete
    result.isComplete = result.pendingClarifications.length === 0;

    if (!result.isComplete) {
      // Return the first question
      result.nextQuestion = result.pendingClarifications[0]?.question;
    }

    logger.info(
      {
        userId: context.userId,
        isComplete: result.isComplete,
        pendingCount: result.pendingClarifications.length,
      },
      'Resolution pipeline completed'
    );

    return result;
  }
}

// Export types and resolvers
export { ContactResolver } from './contact-resolver';
export type { ICalendarService } from './contact-resolver';
export type {
  ContactResolutionResult,
  ContactMatch,
  EventMatchResult,
  EventMatch,
  ConflictInfo,
  TimeResolutionResult,
  CalendarSelectionResult,
} from './types';
