// API endpoint for checking and sending reminder notifications
// This should be called by a cron job every minute

import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@imaginecalendar/database/client';
import { getRemindersByUserId, getVerifiedWhatsappNumberByPhone, logOutgoingWhatsAppMessage } from '@imaginecalendar/database/queries';
import { getUserById } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await connectDb();
    const whatsappService = new WhatsAppService();
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    logger.info({}, 'Checking for due reminders');

    // Get all users with active reminders
    const { getAllUsers } = await import('@imaginecalendar/database/queries');
    const users = await getAllUsers(db);
    
    let notificationsSent = 0;
    const errors: string[] = [];

    for (const user of users) {
      try {
        // Get user's reminders
        const reminders = await getRemindersByUserId(db, user.id);
        
        // Get user's WhatsApp number
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(db, user.phone || '');
        if (!whatsappNumber || !whatsappNumber.isVerified) {
          continue; // Skip users without verified WhatsApp
        }

        // Check each reminder
        for (const reminder of reminders) {
          if (isReminderDueSoon(reminder, now, fiveMinutesFromNow)) {
            // Send notification
            const userName = user.firstName || user.name || 'there';
            const message = `Hey ${userName}! A reminder that ${reminder.title}${reminder.time ? ` at ${formatTime(reminder.time)}` : ''}.`;
            
            try {
              await whatsappService.sendTextMessage(whatsappNumber.phone, message);
              
              // Log the message
              await logOutgoingWhatsAppMessage(db, {
                whatsappNumberId: whatsappNumber.id,
                userId: user.id,
                messageType: 'text',
                messageContent: message,
                isFreeMessage: true,
              });
              
              notificationsSent++;
              logger.info(
                { userId: user.id, reminderId: reminder.id, reminderTitle: reminder.title },
                'Reminder notification sent'
              );
            } catch (sendError) {
              logger.error(
                { error: sendError, userId: user.id, reminderId: reminder.id },
                'Failed to send reminder notification'
              );
              errors.push(`Failed to send reminder ${reminder.id} to user ${user.id}`);
            }
          }
        }
      } catch (userError) {
        logger.error({ error: userError, userId: user.id }, 'Error processing user reminders');
        errors.push(`Error processing reminders for user ${user.id}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Reminder check completed',
      checkedAt: now.toISOString(),
      notificationsSent,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    logger.error({ error }, 'Failed to check reminders');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Check if a reminder is due in the next 5 minutes
 */
function isReminderDueSoon(reminder: any, now: Date, fiveMinutesFromNow: Date): boolean {
  if (!reminder.active) {
    return false;
  }

  // Calculate next occurrence based on frequency
  const nextOccurrence = calculateNextOccurrence(reminder, now);
  
  if (!nextOccurrence) {
    return false;
  }

  // Check if reminder is due in the next 5 minutes
  return nextOccurrence >= now && nextOccurrence <= fiveMinutesFromNow;
}

/**
 * Calculate next occurrence of a reminder
 */
function calculateNextOccurrence(reminder: any, now: Date): Date | null {
  if (reminder.frequency === 'once') {
    if (reminder.targetDate) {
      return new Date(reminder.targetDate);
    } else if (reminder.daysFromNow !== undefined) {
      const next = new Date(now);
      next.setDate(next.getDate() + reminder.daysFromNow);
      if (reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
      }
      return next;
    } else if (reminder.dayOfMonth && reminder.month) {
      const next = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
      if (reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
      }
      if (next < now) {
        next.setFullYear(next.getFullYear() + 1);
      }
      return next;
    }
  } else if (reminder.frequency === 'daily') {
    const next = new Date(now);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
    } else {
      next.setDate(next.getDate() + 1);
    }
    return next;
  } else if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
    return getNextWeeklyOccurrence(now, reminder.daysOfWeek[0], reminder.time);
  } else if (reminder.frequency === 'monthly' && reminder.dayOfMonth) {
    const next = new Date(now);
    next.setDate(reminder.dayOfMonth);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);
    }
    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  } else if (reminder.frequency === 'yearly' && reminder.dayOfMonth && reminder.month) {
    const next = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
    if (reminder.time) {
      const [hours, minutes] = reminder.time.split(':').map(Number);
      next.setHours(hours, minutes, 0, 0);
    }
    if (next < now) {
      next.setFullYear(next.getFullYear() + 1);
    }
    return next;
  }

  return null;
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

/**
 * Format time string to 12-hour format
 */
function formatTime(timeStr: string): string {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

