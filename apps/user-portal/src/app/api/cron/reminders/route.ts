// API endpoint for checking and sending reminder notifications
// This should be called by a cron job every minute
// 
// To set up cron job:
// 1. Add CRON_SECRET to your environment variables
// 2. Set up a cron job to call: GET /api/cron/reminders with Authorization: Bearer {CRON_SECRET}
// 3. Example cron: * * * * * curl -X GET "https://your-domain.com/api/cron/reminders" -H "Authorization: Bearer YOUR_CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@imaginecalendar/database/client';
import { getActiveReminders, logOutgoingWhatsAppMessage, getUserById, getUserWhatsAppNumbers, getAllVerifiedWhatsAppNumbers } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';

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

    logger.info(
      { 
        timestamp: now.toISOString(),
        localTime: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      'Checking for reminders happening in next 1 minute'
    );

    // Send current time to all registered WhatsApp numbers
    let cronNotificationsSent = 0;
    const cronErrors: string[] = [];
    try {
      const allVerifiedNumbers = await getAllVerifiedWhatsAppNumbers(db);
      logger.info(
        { count: allVerifiedNumbers.length },
        'Sending current time to all registered WhatsApp numbers'
      );

      const timeStr = formatCurrentTime(now);
      const dateStr = formatCurrentDate(now);
      const message = `🕐 Cron Job Notification\n\nCurrent Time: ${timeStr}\nDate: ${dateStr}\n\nThis is an automated message from the reminder system.`;

      // Send to all verified WhatsApp numbers
      for (const whatsappNumber of allVerifiedNumbers) {
        try {
          await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, message);
          
          // Log the message
          await logOutgoingWhatsAppMessage(db, {
            whatsappNumberId: whatsappNumber.id,
            userId: whatsappNumber.userId,
            messageType: 'text',
            messageContent: message,
            isFreeMessage: true,
          });
          
          cronNotificationsSent++;
        } catch (sendError) {
          logger.error(
            { 
              error: sendError, 
              userId: whatsappNumber.userId, 
              phoneNumber: whatsappNumber.phoneNumber 
            },
            'Failed to send cron notification'
          );
          cronErrors.push(`Failed to send to ${whatsappNumber.phoneNumber}`);
        }
      }

      logger.info(
        { 
          sent: cronNotificationsSent, 
          total: allVerifiedNumbers.length,
          errors: cronErrors.length 
        },
        'Completed sending cron notifications to all registered WhatsApp numbers'
      );
    } catch (cronError) {
      logger.error(
        { error: cronError },
        'Failed to send cron notifications to all WhatsApp numbers'
      );
      cronErrors.push('Failed to process cron notifications');
    }

    // Get all active reminders efficiently
    const activeReminders = await getActiveReminders(db);

    logger.info(
      { 
        count: activeReminders.length,
        reminderIds: activeReminders.map(r => ({ id: r.id, title: r.title, frequency: r.frequency, time: r.time }))
      },
      'Found active reminders to check'
    );

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
              logger.debug(
                { reminderId: reminder.id, frequency: reminder.frequency },
                'Could not calculate reminder time, skipping'
              );
              continue; // Can't calculate reminder time (e.g., past reminder)
            }

            // Round down to the minute for comparison (remove seconds/milliseconds)
            const reminderMinute = new Date(reminderTime);
            reminderMinute.setSeconds(0, 0);
            
            const nowMinute = new Date(now);
            nowMinute.setSeconds(0, 0);
            
            // Calculate time difference in milliseconds
            const timeUntilReminder = reminderTime.getTime() - now.getTime();
            const oneMinuteInMs = 60 * 1000;
            
            // Check if reminder is happening in the current minute window
            // Since cron runs every minute, we check if the reminder minute matches the current minute
            // OR if the reminder is within the next 1 minute window (0 to 60 seconds from now)
            // We also account for reminders that are slightly in the past (up to 5 seconds) due to cron timing
            const isSameMinute = reminderMinute.getTime() === nowMinute.getTime();
            const isInNextMinute = timeUntilReminder > 0 && timeUntilReminder <= oneMinuteInMs;
            const isJustPassed = timeUntilReminder < 0 && timeUntilReminder >= -5000; // Up to 5 seconds in the past
            
            const shouldNotify = isSameMinute || isInNextMinute || isJustPassed;
            
            logger.debug(
              {
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                reminderTime: reminderTime.toISOString(),
                reminderMinute: reminderMinute.toISOString(),
                now: now.toISOString(),
                nowMinute: nowMinute.toISOString(),
                timeUntilReminderMs: timeUntilReminder,
                timeUntilReminderSeconds: Math.round(timeUntilReminder / 1000),
                isSameMinute,
                isInNextMinute,
                isJustPassed,
                shouldNotify,
              },
              'Checking if reminder should be notified'
            );
            
            if (shouldNotify) {
              // Send notification
              const userName = user.firstName || user.name || 'there';
              const timeStr = reminder.time ? ` at ${formatTime(reminder.time)}` : '';
              
              // Format the reminder time for the message
              const reminderTimeStr = formatReminderTime(reminderTime);
              
              // Create polite and professional message
              let message: string;
              if (reminder.frequency === 'yearly' && reminder.title.toLowerCase().includes('birthday')) {
                // Special message for birthdays
                message = `Hello ${userName}! 👋\n\nThis is a friendly reminder that ${reminder.title}${timeStr ? ` is${timeStr}` : ' is now'}.\n\nWe wanted to make sure you don't miss this special occasion!`;
              } else {
                // Standard reminder message - polite and professional
                message = `Hello ${userName}! 👋\n\nThis is a friendly reminder:\n\n${reminder.title}${timeStr ? `\n\nScheduled for${timeStr}` : `\n\nTime: ${reminderTimeStr}`}\n\nWe hope this helps you stay on top of your schedule!`;
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
                    timeUntilReminderSeconds: Math.round(timeUntilReminder / 1000),
                    frequency: reminder.frequency,
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
      cronNotifications: {
        sent: cronNotificationsSent,
        errors: cronErrors.length > 0 ? cronErrors : undefined
      },
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
        } else {
          // If no time specified, set to midnight
          target.setHours(0, 0, 0, 0);
        }
        target.setSeconds(0, 0);
        // If target date is in the past (more than 1 minute), return null (reminder already passed)
        // We allow 1 minute grace period for cron timing
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        if (target < oneMinuteAgo) {
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
        next.setSeconds(0, 0);
        // If calculated time is in the past, it means daysFromNow was relative to creation, not now
        // For "once" reminders with daysFromNow, we should only fire if it's today or future
        const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
        if (next < oneMinuteAgo) {
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
        next.setSeconds(0, 0);
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
      next.setSeconds(0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
      return next;
    } else if (reminder.frequency === 'minutely' && reminder.intervalMinutes) {
      const next = new Date(now);
      next.setMinutes(next.getMinutes() + reminder.intervalMinutes, 0, 0);
      next.setSeconds(0, 0);
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

/**
 * Format a Date object to a readable time string
 */
function formatReminderTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Format a Date object to a readable time string with seconds
 */
function formatCurrentTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${period}`;
}

/**
 * Format a Date object to a readable date string
 */
function formatCurrentDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

