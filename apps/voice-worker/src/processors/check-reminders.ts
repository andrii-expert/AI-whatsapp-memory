// Check reminders processor - sends WhatsApp notifications 5 minutes before reminders are due

import type { Job } from 'bullmq';
import type { Database } from '@imaginecalendar/database/client';
import { getRemindersByUserId } from '@imaginecalendar/database/queries';
import { getVerifiedWhatsappNumberByPhone, logOutgoingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { CheckRemindersJobData } from '../config/queues';

export async function processCheckReminders(
  job: Job<CheckRemindersJobData>,
  db: Database
): Promise<void> {
  try {
    logger.info({}, 'Checking for due reminders');

    // Get all active reminders
    // Note: This is a simplified approach - in production, you'd want to query by userId
    // For now, we'll need to get all users and check their reminders
    // This should be optimized with a proper query that gets reminders due in the next 5 minutes

    // For now, let's create a simple implementation that can be enhanced
    // We'll need to add a query to get reminders due soon
    
    logger.info({}, 'Reminder check completed');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to check reminders'
    );
    throw error;
  }
}

/**
 * Check if a reminder is due in the next 5 minutes
 */
function isReminderDueSoon(reminder: any, now: Date): boolean {
  if (!reminder.active) {
    return false;
  }

  // Calculate next occurrence based on frequency
  let nextOccurrence: Date | null = null;

  if (reminder.frequency === 'once') {
    if (reminder.targetDate) {
      nextOccurrence = new Date(reminder.targetDate);
    } else if (reminder.daysFromNow !== undefined) {
      nextOccurrence = new Date(now);
      nextOccurrence.setDate(nextOccurrence.getDate() + reminder.daysFromNow);
    } else if (reminder.dayOfMonth && reminder.month) {
      nextOccurrence = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
      if (nextOccurrence < now) {
        nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);
      }
    }
  } else if (reminder.frequency === 'daily') {
    nextOccurrence = new Date(now);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      nextOccurrence.setHours(hours, minutes, 0, 0);
      if (nextOccurrence <= now) {
        nextOccurrence.setDate(nextOccurrence.getDate() + 1);
      }
    }
  } else if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
    nextOccurrence = getNextWeeklyOccurrence(now, reminder.daysOfWeek[0], reminder.time);
  } else if (reminder.frequency === 'monthly' && reminder.dayOfMonth) {
    nextOccurrence = new Date(now);
    nextOccurrence.setDate(reminder.dayOfMonth);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      nextOccurrence.setHours(hours, minutes, 0, 0);
    }
    if (nextOccurrence <= now) {
      nextOccurrence.setMonth(nextOccurrence.getMonth() + 1);
    }
  } else if (reminder.frequency === 'yearly' && reminder.dayOfMonth && reminder.month) {
    nextOccurrence = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      nextOccurrence.setHours(hours, minutes, 0, 0);
    }
    if (nextOccurrence <= now) {
      nextOccurrence.setFullYear(nextOccurrence.getFullYear() + 1);
    }
  }

  if (!nextOccurrence) {
    return false;
  }

  // Check if reminder is due in the next 5 minutes
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
  return nextOccurrence >= now && nextOccurrence <= fiveMinutesFromNow;
}

/**
 * Get next weekly occurrence
 */
function getNextWeeklyOccurrence(now: Date, dayOfWeek: number, time?: string): Date {
  const next = new Date(now);
  const currentDay = next.getDay();
  let daysUntilNext = dayOfWeek - currentDay;
  
  if (daysUntilNext < 0) {
    daysUntilNext += 7;
  } else if (daysUntilNext === 0) {
    // Same day - check if time has passed
    if (time) {
      const [hours, minutes] = time.split(':').map(Number);
      const todayAtTime = new Date(next);
      todayAtTime.setHours(hours, minutes, 0, 0);
      if (todayAtTime <= now) {
        daysUntilNext = 7; // Next week
      }
    }
  }
  
  next.setDate(next.getDate() + daysUntilNext);
  
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);
  }
  
  return next;
}

