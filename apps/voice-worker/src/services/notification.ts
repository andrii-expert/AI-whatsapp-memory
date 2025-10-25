// WhatsApp notification service for voice processing results

import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { WhatsAppMessageResponse } from '@imaginecalendar/whatsapp';
import { logger } from '@imaginecalendar/logger';
import type { CalendarIntent } from '@imaginecalendar/ai-services';
import type { Database } from '@imaginecalendar/database/client';
import { logOutgoingWhatsAppMessage, isWithinFreeMessageWindow } from '@imaginecalendar/database/queries';
import { metrics } from '../utils/metrics';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  provider: 'google' | 'microsoft';
  htmlLink?: string;
  webLink?: string;
}

type MessageLogContext = {
  db: Database;
  whatsappNumberId: string;
  userId: string;
};

export class NotificationService {
  private whatsapp: WhatsAppService;

  constructor() {
    this.whatsapp = new WhatsAppService();
  }

  private async logOutgoingMessage(
    response: WhatsAppMessageResponse | undefined,
    messageType: 'text' | 'interactive',
    logContext?: MessageLogContext
  ) {
    if (!logContext) {
      return;
    }

    try {
      const messageId = response?.messages?.[0]?.id ?? undefined;
      const isFreeMessage = await isWithinFreeMessageWindow(logContext.db, logContext.whatsappNumberId);

      await logOutgoingWhatsAppMessage(logContext.db, {
        whatsappNumberId: logContext.whatsappNumberId,
        userId: logContext.userId,
        messageId,
        messageType,
        isFreeMessage,
      });
    } catch (error) {
      logger.error(
        {
          error,
          messageType,
          whatsappNumberId: logContext.whatsappNumberId,
          userId: logContext.userId,
        },
        'Failed to log outgoing WhatsApp message'
      );
    }
  }

  /**
   * Send success notification when calendar event is created
   */
  async sendSuccess(
    phone: string,
    event: CalendarEvent,
    intent: CalendarIntent,
    transcription: string,
    logContext?: MessageLogContext
  ): Promise<void> {
    try {
      const message = this.formatSuccessMessage(event, intent, transcription);

      // Use plain text message for conversational response within 24-hour window
      const response = await this.whatsapp.sendTextMessage(phone, message);

      await this.logOutgoingMessage(response, 'text', logContext);

      logger.info({ phone, eventId: event.id }, 'Success notification sent');
      metrics.increment('event.created');
    } catch (error) {
      logger.error({ error, phone, eventId: event.id }, 'Failed to send success notification');
      // Don't throw - notification failure shouldn't fail the job
    }
  }

  /**
   * Send error notification when processing fails
   */
  async sendError(phone: string, customMessage?: string, logContext?: MessageLogContext): Promise<void> {
    try {
      const message = customMessage ||
        "Sorry, I couldn't process your voice note. Please try again or send a text message instead.";

      // Use plain text message for conversational response within 24-hour window
      const response = await this.whatsapp.sendTextMessage(phone, message);

      await this.logOutgoingMessage(response, 'text', logContext);

      logger.info({ phone }, 'Error notification sent');
    } catch (error) {
      logger.error({ error, phone }, 'Failed to send error notification');
      // Don't throw - notification failure shouldn't fail the job
    }
  }

  async sendUpdateSuccess(
    phone: string,
    event: CalendarEvent,
    intent: CalendarIntent,
    logContext?: MessageLogContext
  ): Promise<void> {
    try {
      const message = this.formatUpdateMessage(event, intent);
      const response = await this.whatsapp.sendTextMessage(phone, message);

      await this.logOutgoingMessage(response, 'text', logContext);
      logger.info({ phone, eventId: event.id }, 'Update notification sent');
      metrics.increment('event.updated');
    } catch (error) {
      logger.error({ error, phone, eventId: event.id }, 'Failed to send update notification');
    }
  }

  async sendDeleteSuccess(
    phone: string,
    event: CalendarEvent,
    intent: CalendarIntent,
    logContext?: MessageLogContext
  ): Promise<void> {
    try {
      const message = this.formatDeleteMessage(event, intent);
      const response = await this.whatsapp.sendTextMessage(phone, message);

      await this.logOutgoingMessage(response, 'text', logContext);
      logger.info({ phone, eventId: event.id }, 'Delete notification sent');
      metrics.increment('event.deleted');
    } catch (error) {
      logger.error({ error, phone, eventId: event.id }, 'Failed to send delete notification');
    }
  }

  /**
   * Send event verification request with Yes/No buttons
   */
  async sendVerification(
    phone: string,
    intent: CalendarIntent,
    operationType: 'create' | 'update' | 'delete' = 'create',
    targetEventId?: string,
    logContext?: MessageLogContext
  ): Promise<void> {
    try {
      // Format the event details
      const eventDetails = this.formatEventDetails(intent);

      // Customize message based on operation type
      let message: string;
      let yesButtonText: string;

      switch (operationType) {
        case 'create':
          message = `Please confirm this event:\n\n${eventDetails}\n\nWould you like me to create this event?`;
          yesButtonText = 'Yes, create it';
          break;
        case 'update':
          message = `Please confirm these changes:\n\n${eventDetails}\n\nWould you like me to update this event?`;
          yesButtonText = 'Yes, update it';
          break;
        case 'delete':
          message = `Please confirm deletion:\n\n${eventDetails}\n\nWould you like me to delete this event?`;
          yesButtonText = 'Yes, delete it';
          break;
      }

      const response = await this.whatsapp.sendReplyButtonMessage(phone, {
        bodyText: message,
        buttons: [
          { id: 'verify_yes', title: yesButtonText },
          { id: 'verify_no', title: 'No, cancel' }
        ]
      });

      await this.logOutgoingMessage(response, 'interactive', logContext);

      logger.info({ phone, intent, operationType }, 'Verification request sent');
    } catch (error) {
      logger.error({ error, phone, operationType }, 'Failed to send verification request');
      throw error;
    }
  }

  /**
   * Send clarification request when more info is needed
   */
  async sendClarification(
    phone: string,
    question: string,
    options?: string[],
    logContext?: MessageLogContext
  ): Promise<void> {
    try {
      // If no options, send only text message
      if (!options?.length) {
        const message = this.buildClarificationMessage(question, options);
        const response = await this.whatsapp.sendTextMessage(phone, message);
        await this.logOutgoingMessage(response, 'text', logContext);
        metrics.increment('clarification.prompt_sent', { channel: 'text' });
        return;
      }

      // If we have options, send interactive message (buttons or list) without text duplication
      if (options.length <= 3) {
        const response = await this.whatsapp.sendReplyButtonMessage(phone, {
          bodyText: question,
          buttons: options.map((option, index) => ({
            id: `option_${index}`,
            title: option.substring(0, 20),
          })),
        });

        await this.logOutgoingMessage(response, 'interactive', logContext);
        logger.info({ phone, question, optionCount: options.length }, 'Clarification buttons sent');
        metrics.increment('clarification.prompt_sent', { channel: 'buttons' });
        return;
      }

      if (options.length <= 10) {
        const response = await this.whatsapp.sendListMessage(phone, {
          bodyText: question,
          buttonText: 'Select option',
          options: options.map((option, index) => ({
            id: `option_${index}`,
            title: option.substring(0, 24),
            description: undefined,
          })),
        });

        await this.logOutgoingMessage(response, 'interactive', logContext);
        logger.info({ phone, question, optionCount: options.length }, 'Clarification list sent');
        metrics.increment('clarification.prompt_sent', { channel: 'list' });
        return;
      }

      // If more than 10 options, fall back to text with formatted list
      const message = this.buildClarificationMessage(question, options);
      const response = await this.whatsapp.sendTextMessage(phone, message);
      await this.logOutgoingMessage(response, 'text', logContext);
      metrics.increment('clarification.prompt_sent', { channel: 'text' });
    } catch (error) {
      logger.error({ error, phone }, 'Failed to send clarification request');
    }
  }

  async sendClarificationPrompt(
    phone: string,
    prompt: {
      type: 'text' | 'buttons' | 'list';
      question: string;
      options?: Array<{ id: string; label: string; value: string }>;
    },
    logContext?: MessageLogContext
  ): Promise<{ messageId?: string | null }> {
    const optionLabels = (prompt.options ?? []).map((option) => option.label);

    // For text-only prompts or no options, send text message
    if (prompt.type === 'text' || !prompt.options?.length) {
      try {
        const message = this.buildClarificationMessage(prompt.question, optionLabels);
        const response = await this.whatsapp.sendTextMessage(phone, message);
        await this.logOutgoingMessage(response, 'text', logContext);
        metrics.increment('clarification.prompt_sent', { channel: 'text' });
      } catch (error) {
        logger.error({ error, phone, type: prompt.type }, 'Failed to send clarification text prompt');
      }
      return { messageId: null };
    }

    // For interactive prompts (buttons/list), send only the interactive message
    try {
      if (prompt.type === 'buttons') {
        const buttons = (prompt.options ?? []).slice(0, 3).map((option) => ({
          id: option.id,
          title: option.label.substring(0, 20),
        }));

        const response = await this.whatsapp.sendReplyButtonMessage(phone, {
          bodyText: prompt.question,
          buttons,
        });

        await this.logOutgoingMessage(response, 'interactive', logContext);
        metrics.increment('clarification.prompt_sent', { channel: 'buttons' });
        return { messageId: response.messages?.[0]?.id ?? null };
      }

      const listOptions = (prompt.options ?? []).map((option) => ({
        id: option.id,
        title: option.label.substring(0, 24),
      }));

      const response = await this.whatsapp.sendListMessage(phone, {
        bodyText: prompt.question,
        buttonText: 'Select option',
        options: listOptions,
      });

      await this.logOutgoingMessage(response, 'interactive', logContext);
      metrics.increment('clarification.prompt_sent', { channel: 'list' });
      return { messageId: response.messages?.[0]?.id ?? null };
    } catch (error) {
      logger.error({ error, phone, type: prompt.type }, 'Failed to send clarification interactive prompt');
      return { messageId: null };
    }
  }

  async sendClarificationReminder(
    phone: string,
    pendingFields: string[]
  ): Promise<void> {
    try {
      logger.info({ phone, pendingFields }, 'Skipped clarification reminder (disabled)');
    } catch (error) {
      logger.error({ error, phone }, 'Failed to send clarification reminder');
    }
  }

  async sendClarificationTimeout(
    phone: string,
    pendingFields: string[]
  ): Promise<void> {
    try {
      logger.info({ phone, pendingFields }, 'Skipped clarification timeout notice (disabled)');
    } catch (error) {
      logger.error({ error, phone }, 'Failed to send clarification timeout notice');
    }
  }

  /**
   * Format event details for verification
   */
  private formatEventDetails(intent: CalendarIntent): string {
    let details = `📅 ${intent.title || 'Untitled Event'}`;

    if (intent.startDate) {
      const startDate = new Date(intent.startDate);
      details += `\n🗓 ${this.formatDate(startDate)}`;

      if (intent.startTime) {
        details += `\n🕐 ${intent.startTime}`;
        if (intent.duration) {
          details += ` (${this.formatDuration(intent.duration)})`;
        } else if (intent.endTime) {
          details += ` - ${intent.endTime}`;
        }
      } else if (intent.isAllDay) {
        details += ` (All day)`;
      }
    }

    if (intent.attendees && intent.attendees.length > 0) {
      details += `\n👥 Attendees: ${intent.attendees.join(', ')}`;
    }

    if (intent.location) {
      details += `\n📍 ${intent.location}`;
    }

    if (intent.description) {
      details += `\n📝 ${intent.description}`;
    }

    return details;
  }

  /**
   * Format success message with event details
   */
  private formatSuccessMessage(
    event: CalendarEvent,
    intent: CalendarIntent,
    transcription: string
  ): string {
    const formattedDate = this.formatDate(event.start);
    const formattedTime = this.formatTime(event.start);

    let message = `✅ Event created!\n\n`;
    message += `📅 ${event.title}\n`;
    message += `🕐 ${formattedDate} at ${formattedTime}`;

    if (intent.attendees && intent.attendees.length > 0) {
      message += `\n👥 Attendees: ${intent.attendees.join(', ')}`;
    }

    if (intent.location) {
      message += `\n📍 ${intent.location}`;
    }

    // Add calendar link if available
    const link = event.htmlLink || event.webLink;
    if (link) {
      message += `\n\n🔗 View event: ${link}`;
    }

    return message;
  }

  private formatUpdateMessage(event: CalendarEvent, intent: CalendarIntent): string {
    const formattedDate = this.formatDate(event.start);
    const formattedTime = this.formatTime(event.start);

    let message = `✅ Event updated!\n\n`;
    message += `📅 ${event.title}\n`;
    message += `🕐 ${formattedDate} at ${formattedTime}`;

    if (intent.location) {
      message += `\n📍 ${intent.location}`;
    }

    const link = event.htmlLink || event.webLink;
    if (link) {
      message += `\n\n🔗 View event: ${link}`;
    }

    return message;
  }

  private formatDeleteMessage(event: CalendarEvent, intent: CalendarIntent): string {
    let message = `🗑️ Event deleted.\n\n`;
    message += `📅 ${event.title}`;

    if (intent.startDate) {
      const date = new Date(intent.startDate);
      message += `\n🗓 ${this.formatDate(date)}`;

      if (intent.startTime) {
        const iso = `${intent.startDate}T${intent.startTime}:00+02:00`;
        message += ` at ${this.formatTime(new Date(iso))}`;
      }
    }

    message += `\n\nIf this was a mistake, let me know and I can help recreate it.`;
    return message;
  }

  /**
   * Format date in user-friendly format
   */
  private formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    return date.toLocaleDateString('en-US', options);
  }

  /**
   * Format time in user-friendly format (GMT+2 / Africa/Johannesburg)
   */
  private formatTime(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Johannesburg', // GMT+2
    };
    return date.toLocaleTimeString('en-US', options);
  }

  /**
   * Format duration in user-friendly format
   * Input is in minutes
   */
  private formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`;
  }

  private buildClarificationMessage(question: string, options?: string[]): string {
    const headline = question.trim().startsWith('📝')
      ? question.trim()
      : `📝 ${question.trim()}`;

    const lines: string[] = [headline];

    if (options && options.length > 0) {
      lines.push('', '👉 Choose one of the options below:');
      options.forEach((option, index) => {
        lines.push(`${index + 1}. ${option}`);
      });
      //lines.push('', 'You can reply with the number or share a different detail if needed.');
    } else {
      //lines.push('', 'Just type your answer when you have a moment.');
    }

    return lines.join('\n');
  }
}
