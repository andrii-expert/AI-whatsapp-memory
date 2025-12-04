// API endpoint for checking and sending reminder notifications
// This should be called by a cron job every minute
// 
// To set up cron job:
// 1. Add CRON_SECRET to your environment variables
// 2. Set up a cron job to call: GET /api/cron/reminders with Authorization: Bearer {CRON_SECRET}
// 3. Example cron: * * * * * curl -X GET "https://your-domain.com/api/cron/reminders" -H "Authorization: Bearer YOUR_CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@imaginecalendar/database/client';
import { getRemindersByUserId, logOutgoingWhatsAppMessage, getUserById, getUserWhatsAppNumbers } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { reminders } from '@imaginecalendar/database/schema';
import { eq, and } from 'drizzle-orm';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

// In-memory cache to prevent duplicate notifications within the same minute
// Key: reminderId, Value: timestamp when notification was sent
const notificationCache = new Map<string, number>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (allow bypass in development if not set)
    const authHeader = req.headers.get('authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      logger.warn({ authHeader: authHeader ? 'present' : 'missing' }, 'Unauthorized cron request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!CRON_SECRET) {
      logger.warn({}, 'CRON_SECRET not set - allowing request (development mode)');
    }

    const db = await connectDb();
    const whatsappService = new WhatsAppService();
    const now = new Date();
    
    // Clean up old cache entries
    cleanupNotificationCache(now);

    logger.info({ timestamp: now.toISOString() }, 'Checking for due reminders');

    // Get all active reminders efficiently
    const activeReminders = await db
      .select()
      .from(reminders)
      .where(eq(reminders.active, true));

    logger.info({ count: activeReminders.length }, 'Found active reminders');

    let notificationsSent = 0;
    let notificationsSkipped = 0;
    const errors: string[] = [];

    // Group reminders by user to batch WhatsApp lookups
    const remindersByUser = new Map<string, typeof activeReminders>();
    for (const reminder of activeReminders) {
      if (!remindersByUser.has(reminder.userId)) {
        remindersByUser.set(reminder.userId, []);
      }
      remindersByUser.get(reminder.userId)!.push(reminder);
    }

    // Process each user's reminders
    for (const [userId, userReminders] of remindersByUser.entries()) {
      try {
        // Get user info
        const user = await getUserById(db, userId);
        if (!user) {
          logger.warn({ userId }, 'User not found for reminder');
          continue;
        }

        // Get user's verified WhatsApp numbers (prefer primary, then any verified)
        const whatsappNumbers = await getUserWhatsAppNumbers(db, userId);
        const whatsappNumber = whatsappNumbers.find(n => n.isVerified && n.isActive) || 
                              whatsappNumbers.find(n => n.isVerified);
        
        if (!whatsappNumber) {
          logger.debug({ userId }, 'User has no verified WhatsApp number, skipping');
          continue; // Skip users without verified WhatsApp
        }

        // Check each reminder for this user
        for (const reminder of userReminders) {
          try {
            // Check if we've already sent a notification for this reminder recently
            const cacheKey = `${reminder.id}`;
            const lastSent = notificationCache.get(cacheKey);
            if (lastSent && (now.getTime() - lastSent) < CACHE_TTL) {
              notificationsSkipped++;
              logger.debug(
                { reminderId: reminder.id, lastSent: new Date(lastSent).toISOString() },
                'Skipping duplicate notification'
              );
              continue;
            }

            // Calculate when this reminder should actually occur (the time user wants to be reminded about)
            const reminderTime = calculateReminderTime(reminder, now);
            
            if (!reminderTime) {
              continue; // Can't calculate reminder time (e.g., past reminder)
            }

            // Calculate time until the reminder should occur
            const timeUntilReminder = reminderTime.getTime() - now.getTime();
            const fiveMinutesInMs = 5 * 60 * 1000;
            const oneMinuteInMs = 60 * 1000;
            
            // Fire notification if reminder is due in approximately 5 minutes
            // We check within a 1-minute window to account for cron job timing variations
            // This means we'll send the notification when there are 4-6 minutes remaining
            const shouldNotify = timeUntilReminder >= (fiveMinutesInMs - oneMinuteInMs) && 
                               timeUntilReminder <= (fiveMinutesInMs + oneMinuteInMs);
            
            if (shouldNotify) {
              // Send notification
              const userName = user.firstName || user.name || 'there';
              const timeStr = reminder.time ? ` at ${formatTime(reminder.time)}` : '';
              
              // Create polite and professional message
              let message: string;
              if (reminder.frequency === 'yearly' && reminder.title.toLowerCase().includes('birthday')) {
                // Special message for birthdays
                message = `Hello ${userName}! 👋\n\nThis is a friendly reminder that ${reminder.title}${timeStr ? ` is coming up${timeStr}` : ' is coming up'}.\n\nWe wanted to make sure you don't miss this special occasion!`;
              } else {
                // Standard reminder message - polite and professional
                message = `Hello ${userName}! 👋\n\nThis is a friendly reminder:\n\n${reminder.title}${timeStr ? `\n\nScheduled for${timeStr}` : ''}\n\nWe hope this helps you stay on top of your schedule!`;
              }
              
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
                
                // Cache the notification to prevent duplicates
                notificationCache.set(cacheKey, now.getTime());
                
                notificationsSent++;
                logger.info(
                  {
                    userId: user.id,
                    reminderId: reminder.id,
                    reminderTitle: reminder.title,
                    reminderTime: reminderTime.toISOString(),
                    timeUntilReminder: Math.round(timeUntilReminder / 1000 / 60) + ' minutes',
                  },
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
          } catch (reminderError) {
            logger.error(
              { error: reminderError, reminderId: reminder.id, userId },
              'Error processing reminder'
            );
            errors.push(`Error processing reminder ${reminder.id}`);
          }
        }
      } catch (userError) {
        logger.error({ error: userError, userId }, 'Error processing user reminders');
        errors.push(`Error processing reminders for user ${userId}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Reminder check completed',
      checkedAt: now.toISOString(),
      remindersChecked: activeReminders.length,
      notificationsSent,
      notificationsSkipped,
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
 * Clean up old cache entries
 */
function cleanupNotificationCache(now: Date): void {
  const nowTime = now.getTime();
  for (const [key, timestamp] of notificationCache.entries()) {
    if (nowTime - timestamp > CACHE_TTL) {
      notificationCache.delete(key);
    }
  }
}

/**
 * Calculate the actual time when the reminder should occur (not 5 minutes before)
 * This is the time the user wants to be reminded about
 */
function calculateReminderTime(reminder: any, now: Date): Date | null {
  try {
    if (reminder.frequency === 'once') {
      if (reminder.targetDate) {
        const target = new Date(reminder.targetDate);
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          target.setHours(hours, minutes, 0, 0);
        }
        // If target date is in the past, return null (reminder already passed)
        if (target < now) {
          return null;
        }
        return target;
      } else if (reminder.daysFromNow !== undefined) {
        const next = new Date(now);
        next.setDate(next.getDate() + reminder.daysFromNow);
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
        } else {
          // Default to 9am if no time specified
          next.setHours(9, 0, 0, 0);
        }
        // If calculated time is in the past, it means daysFromNow was relative to creation, not now
        // For "once" reminders with daysFromNow, we should only fire if it's today or future
        if (next < now) {
          return null; // Already passed
        }
        return next;
      } else if (reminder.dayOfMonth && reminder.month) {
        // This is for "once" reminders with specific date
        const next = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          next.setHours(hours, minutes, 0, 0);
        } else {
          next.setHours(9, 0, 0, 0);
        }
        if (next < now) {
          // If this year's date has passed, check next year
          next.setFullYear(next.getFullYear() + 1);
        }
        return next;
      }
      return null; // Can't calculate
    } else if (reminder.frequency === 'daily') {
      const next = new Date(now);
      if (reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
        next.setSeconds(0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
      } else {
        // No time specified, default to tomorrow at 9am
        next.setDate(next.getDate() + 1);
        next.setHours(9, 0, 0, 0);
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
      } else {
        next.setHours(9, 0, 0, 0);
      }
      next.setSeconds(0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        // Handle month overflow (e.g., Jan 31 -> Feb 31 becomes Mar 3)
        if (next.getDate() !== reminder.dayOfMonth) {
          // Day doesn't exist in next month, set to last day of that month
          next.setDate(0); // Goes to last day of previous month
        }
      }
      return next;
    } else if (reminder.frequency === 'yearly' && reminder.dayOfMonth && reminder.month) {
      const next = new Date(now.getFullYear(), reminder.month - 1, reminder.dayOfMonth);
      if (reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
      } else {
        next.setHours(9, 0, 0, 0);
      }
      next.setSeconds(0, 0);
      if (next < now) {
        next.setFullYear(next.getFullYear() + 1);
      }
      return next;
    } else if (reminder.frequency === 'hourly' && reminder.minuteOfHour !== undefined) {
      const next = new Date(now);
      next.setMinutes(reminder.minuteOfHour, 0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
      return next;
    } else if (reminder.frequency === 'minutely' && reminder.intervalMinutes) {
      const next = new Date(now);
      next.setMinutes(next.getMinutes() + reminder.intervalMinutes, 0, 0);
      return next;
    }

    return null;
  } catch (error) {
    logger.error({ error, reminderId: reminder.id, frequency: reminder.frequency }, 'Error calculating reminder time');
    return null;
  }
}

/**
 * Calculate next occurrence of a reminder (the actual reminder time)
 */
function calculateNextOccurrence(reminder: any, now: Date): Date | null {
  return calculateReminderTime(reminder, now);
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
      todayAtTime.setSeconds(0, 0);
      if (todayAtTime <= now) {
        daysUntilNext = 7; // Next week
      }
    } else {
      // No time specified, default to 9am
      const todayAtTime = new Date(next);
      todayAtTime.setHours(9, 0, 0, 0);
      if (todayAtTime <= now) {
        daysUntilNext = 7; // Next week
      }
    }
  }
  
  next.setDate(next.getDate() + daysUntilNext);
  
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    next.setHours(hours, minutes, 0, 0);
  } else {
    next.setHours(9, 0, 0, 0); // Default to 9am
  }
  next.setSeconds(0, 0);
  
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

