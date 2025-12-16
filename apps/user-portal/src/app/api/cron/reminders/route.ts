// API endpoint for checking and sending reminder notifications
// This should be called by a cron job every minute
// 
// To set up cron job:
// 1. Add CRON_SECRET to your environment variables
// 2. Set up a cron job to call: GET /api/cron/reminders with Authorization: Bearer {CRON_SECRET}
// 3. Example cron: * * * * * curl -X GET "https://your-domain.com/api/cron/reminders" -H "Authorization: Bearer YOUR_CRON_SECRET"

import { NextRequest, NextResponse } from 'next/server';
import { connectDb } from '@imaginecalendar/database/client';
import { getActiveReminders, logOutgoingWhatsAppMessage, getUserById, getUserWhatsAppNumbers, toggleReminderActive } from '@imaginecalendar/database/queries';
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
    const now = new Date();
    
    // Check WhatsApp configuration before proceeding
    const hasWhatsAppConfig = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
    if (!hasWhatsAppConfig) {
      logger.error(
        {
          hasAccessToken: !!process.env.WHATSAPP_ACCESS_TOKEN,
          hasPhoneNumberId: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        },
        'WhatsApp service not configured - cannot send reminder messages'
      );
      return NextResponse.json(
        { 
          error: 'WhatsApp service not configured',
          message: 'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID environment variables'
        },
        { status: 500 }
      );
    }
    
    const whatsappService = new WhatsAppService();
    
    // Clean up old cache entries
    cleanupNotificationCache(now);

    logger.info(
      { 
        timestamp: now.toISOString(),
        localTime: now.toLocaleString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hasWhatsAppConfig: !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
      },
      'Starting reminder check cron job'
    );

    // Get all active reminders efficiently
    const activeReminders = await getActiveReminders(db);

    logger.info(
      { 
        count: activeReminders.length,
        reminderIds: activeReminders.map(r => ({ id: r.id, title: r.title, frequency: r.frequency, time: r.time, userId: r.userId }))
      },
      'Found active reminders to check'
    );
    
    if (activeReminders.length === 0) {
      logger.info({}, 'No active reminders found, exiting');
      return NextResponse.json({ 
        success: true, 
        message: 'No active reminders to check',
        checkedAt: now.toISOString(),
        remindersChecked: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
      });
    }

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

        // Get user's timezone
        const userTimezone = (user as any).timezone;
        if (!userTimezone) {
          logger.warn({ userId }, 'User has no timezone set, skipping reminders');
          continue; // Skip users without timezone set
        }

        // Get current time in user's timezone
        const now = new Date();
        const userTimeString = now.toLocaleString("en-US", { timeZone: userTimezone });
        const userLocalTimeDate = new Date(userTimeString);
        
        // Extract user's local time components (these represent the actual time in user's timezone)
        const userLocalTime = {
          year: userLocalTimeDate.getFullYear(),
          month: userLocalTimeDate.getMonth(),
          day: userLocalTimeDate.getDate(),
          hours: userLocalTimeDate.getHours(),
          minutes: userLocalTimeDate.getMinutes(),
          seconds: userLocalTimeDate.getSeconds(),
          date: userLocalTimeDate, // This Date object represents the current time in user's timezone
        };
        
        logger.info(
          {
            userId,
            serverTime: now.toISOString(),
            userTimezone,
            userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')} on ${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
            remindersCount: userReminders.length,
          },
          'Processing reminders for user'
        );
        
        logger.info(
          {
            userId,
            serverTime: now.toISOString(),
            serverTimezoneOffset: now.getTimezoneOffset(),
                currentTime: now.toISOString(),
            userTimezone,
            userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')} on ${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
          },
          'Timezone conversion for user'
        );

        // Get user's verified WhatsApp numbers (prefer primary, then any verified)
        const whatsappNumbers = await getUserWhatsAppNumbers(db, userId);
        logger.info(
          {
            userId,
            whatsappNumbersCount: whatsappNumbers.length,
            whatsappNumbers: whatsappNumbers.map(n => ({
              phoneNumber: n.phoneNumber,
              isVerified: n.isVerified,
              isActive: n.isActive,
              isPrimary: n.isPrimary,
            })),
          },
          'Checking WhatsApp numbers for user'
        );
        
        const whatsappNumber = whatsappNumbers.find(n => n.isVerified && n.isActive) || 
                              whatsappNumbers.find(n => n.isVerified);
        
        if (!whatsappNumber) {
          logger.warn(
            {
              userId,
              whatsappNumbersCount: whatsappNumbers.length,
              availableNumbers: whatsappNumbers.map(n => ({
                phoneNumber: n.phoneNumber,
                isVerified: n.isVerified,
                isActive: n.isActive,
              })),
            },
            'User has no verified WhatsApp number, skipping'
          );
          continue; // Skip users without verified WhatsApp
        }
        
        logger.info(
          {
            userId,
            whatsappNumberId: whatsappNumber.id,
            phoneNumber: whatsappNumber.phoneNumber,
            isVerified: whatsappNumber.isVerified,
            isActive: whatsappNumber.isActive,
          },
          'Found verified WhatsApp number for user'
        );

        // Check each reminder and send notification if it's due now (within 1 minute)
        // We check based on the user's current local time in their timezone
        const dueReminders: Array<{ reminder: any; reminderTime: Date }> = [];
        
        for (const reminder of userReminders) {
          try {
            // Check if this reminder should fire now based on user's local time
            const shouldFire = checkIfReminderShouldFire(reminder, userLocalTime, userTimezone);
            
            if (!shouldFire.shouldNotify) {
              logger.debug(
                {
                  reminderId: reminder.id,
                  frequency: reminder.frequency,
                  reason: shouldFire.reason,
                  userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}`,
                },
                'Reminder not due yet'
              );
              continue;
            }
            
            // Calculate the actual reminder time for display purposes
            const reminderTime = shouldFire.reminderTime || calculateReminderTime(reminder, userLocalTime, userTimezone);
            
            if (!reminderTime) {
              logger.debug(
                { reminderId: reminder.id, frequency: reminder.frequency },
                'Could not calculate reminder time, skipping'
              );
              continue;
            }
            
            logger.info(
              {
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                reminderTime: reminderTime.toISOString(),
                currentTime: now.toISOString(),
                userTimezone,
                userLocalTime: `${userLocalTime.hours}:${String(userLocalTime.minutes).padStart(2, '0')}:${String(userLocalTime.seconds).padStart(2, '0')}`,
                reason: shouldFire.reason,
              },
              'Reminder is due - will send notification'
            );
            
            // Only process reminders that are due now
            if (shouldFire.shouldNotify) {
              // Check cache to prevent duplicate notifications
              const reminderDate = new Date(reminderTime);
              const dateKey = `${reminderDate.getUTCFullYear()}-${reminderDate.getUTCMonth() + 1}-${reminderDate.getUTCDate()}-${reminderDate.getUTCHours()}-${reminderDate.getUTCMinutes()}`;
              const cacheKey = `${reminder.id}-${dateKey}`;
              const lastSent = notificationCache.get(cacheKey);
              
              if (!lastSent || (now.getTime() - lastSent) >= CACHE_TTL) {
                dueReminders.push({ reminder, reminderTime });
              } else {
                notificationsSkipped++;
                logger.debug(
                  { reminderId: reminder.id, lastSent: new Date(lastSent).toISOString(), cacheKey },
                  'Skipping duplicate notification (already sent recently)'
                );
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
        
        // Send notifications for reminders that are due now (within 1 minute)
        for (const { reminder, reminderTime } of dueReminders) {
          try {
            // Format reminder time for message using user's timezone
            const reminderTimeInUserTz = new Date(reminderTime.toLocaleString("en-US", { timeZone: userTimezone }));
            const hours = reminderTimeInUserTz.getHours();
            const minutes = reminderTimeInUserTz.getMinutes();
            const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
            const period = hours >= 12 ? 'PM' : 'AM';
            const reminderTimeStr = `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
            
            logger.info(
              {
                userId: user.id,
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                reminderTime: reminderTime.toISOString(),
                reminderLocalTime: `${hours}:${String(minutes).padStart(2, '0')}`,
                userTimezone,
                formattedTime: reminderTimeStr,
              },
              'Reminder due - preparing notification with user timezone'
            );
            
            // Create reminder message in professional format
            const message = `🚨 Reminder Alarm:\nTitle: *${reminder.title}*\nDate: Now`;
            
            logger.info(
              {
                userId: user.id,
                phoneNumber: whatsappNumber.phoneNumber,
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                reminderTime: reminderTime.toISOString(),
                reminderLocalTimeFormatted: reminderTimeStr,
                messageLength: message.length,
                message: message.substring(0, 200) + '...', // Log first 200 chars
              },
              'Preparing to send due reminder notification'
            );
            
            try {
              await whatsappService.sendTextMessage(whatsappNumber.phoneNumber, message);
              
              // Log the message
              await logOutgoingWhatsAppMessage(db, {
                whatsappNumberId: whatsappNumber.id,
                userId: user.id,
                messageType: 'text',
                messageContent: message,
                isFreeMessage: true,
              });
              
              // Cache the notification to prevent duplicates
              const reminderDate = new Date(reminderTime);
              const dateKey = `${reminderDate.getUTCFullYear()}-${reminderDate.getUTCMonth() + 1}-${reminderDate.getUTCDate()}-${reminderDate.getUTCHours()}-${reminderDate.getUTCMinutes()}`;
              const cacheKey = `${reminder.id}-${dateKey}`;
              notificationCache.set(cacheKey, now.getTime());
              
              notificationsSent++;
              logger.info(
                {
                  userId: user.id,
                  phoneNumber: whatsappNumber.phoneNumber,
                  reminderId: reminder.id,
                  reminderTitle: reminder.title,
                  reminderTime: reminderTime.toISOString(),
                  frequency: reminder.frequency,
                },
                'Reminder notification sent successfully'
              );
              
              // Deactivate one-time reminders after they fire
              if (reminder.frequency === 'once') {
                try {
                  await toggleReminderActive(db, reminder.id, user.id, false);
                  logger.info(
                    {
                      userId: user.id,
                      reminderId: reminder.id,
                      reminderTitle: reminder.title,
                    },
                    'One-time reminder deactivated after firing'
                  );
                } catch (deactivateError) {
                  logger.error(
                    {
                      error: deactivateError,
                      userId: user.id,
                      reminderId: reminder.id,
                    },
                    'Failed to deactivate one-time reminder after firing'
                  );
                }
              }
            } catch (sendError) {
              logger.error(
                {
                  error: sendError,
                  errorMessage: sendError instanceof Error ? sendError.message : String(sendError),
                  errorStack: sendError instanceof Error ? sendError.stack : undefined,
                  userId: user.id,
                  phoneNumber: whatsappNumber.phoneNumber,
                  reminderId: reminder.id,
                  reminderTitle: reminder.title,
                },
                'Failed to send reminder notification'
              );
              errors.push(`Failed to send reminder ${reminder.id} to user ${user.id}: ${sendError instanceof Error ? sendError.message : String(sendError)}`);
            }
          } catch (reminderError) {
            logger.error(
              { error: reminderError, reminderId: reminder.id, userId },
              'Error sending due reminder'
            );
            errors.push(`Error sending reminder ${reminder.id}`);
          }
        }
      } catch (userError) {
        logger.error({ error: userError, userId }, 'Error processing user reminders');
        errors.push(`Error processing reminders for user ${userId}`);
      }
    }

    logger.info(
      {
        remindersChecked: activeReminders.length,
        notificationsSent,
        notificationsSkipped,
        errorsCount: errors.length,
        usersProcessed: remindersByUser.size,
      },
      'Reminder check completed'
    );
    
    return NextResponse.json({ 
      success: true, 
      message: 'Reminder check completed',
      checkedAt: now.toISOString(),
      remindersChecked: activeReminders.length,
      notificationsSent,
      notificationsSkipped,
      usersProcessed: remindersByUser.size,
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
 * Get the current UTC time (server time converted to UTC)
 * Server is in UTC+4, so we need to subtract 4 hours to get UTC
 * getTimezoneOffset() returns minutes behind UTC (positive = behind, negative = ahead)
 * For UTC+4, it returns -240 (negative because ahead of UTC)
 * To convert to UTC: UTC = Local - offset = Local - (-240) = Local + 240 minutes = Local + 4 hours
 * But we want to subtract, so: UTC = Local + offset (where offset is negative)
 */
function getCurrentUtcTime(): Date {
  const now = new Date();
  // getTimezoneOffset() returns minutes behind UTC
  // For UTC+4, it returns -240 (negative = ahead of UTC)
  // To convert local to UTC: UTC = Local + offset (offset is negative, so this subtracts)
  const serverTimezoneOffsetMs = now.getTimezoneOffset() * 60 * 1000;
  const utcTimestamp = now.getTime() + serverTimezoneOffsetMs;
  const utcDate = new Date(utcTimestamp);
  
  // Log for debugging
  logger.debug({
    serverLocalTime: now.toISOString(),
    serverTimezoneOffset: now.getTimezoneOffset(),
    serverTimezoneOffsetMs,
    calculatedUtc: utcDate.toISOString(),
    serverTimeHours: now.getHours(),
    utcHours: utcDate.getUTCHours(),
  }, 'Converting server time to UTC');
  
  return utcDate;
}

/**
 * Convert UTC time to user's local time using their UTC offset
 * @param utcTime - Current UTC time
 * @param utcOffset - User's UTC offset (e.g., "-05:00", "+02:00")
 * @returns Object with local time components (year, month, day, hours, minutes, etc.)
 * 
 * Example: If UTC is 10:00 and user is UTC-5, their local time is 05:00
 * Example: If UTC is 10:00 and user is UTC+2, their local time is 12:00
 */
function getLocalTimeComponents(utcTime: Date, utcOffset: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
  date: Date; // Date object for the local time (for calculations)
} {
  // Parse UTC offset (e.g., "-05:00" or "+02:00")
  const offsetMatch = utcOffset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!offsetMatch) {
    logger.warn({ utcOffset }, 'Invalid UTC offset format, using UTC time');
    return {
      year: utcTime.getUTCFullYear(),
      month: utcTime.getUTCMonth(),
      day: utcTime.getUTCDate(),
      hours: utcTime.getUTCHours(),
      minutes: utcTime.getUTCMinutes(),
      seconds: utcTime.getUTCSeconds(),
      date: utcTime,
    };
  }

  const [, sign, hours, minutes] = offsetMatch;
  const offsetHours = parseInt(hours || '0', 10);
  const offsetMinutes = parseInt(minutes || '0', 10);
  const totalOffsetMinutes = offsetHours * 60 + offsetMinutes;
  const offsetMs = totalOffsetMinutes * 60 * 1000;
  // offsetMsWithSign: negative for UTC- (e.g., UTC-5 = -300 minutes), positive for UTC+ (e.g., UTC+2 = +120 minutes)
  const offsetMsWithSign = sign === '-' ? -offsetMs : offsetMs;

  // Convert UTC to user's local time
  // If user is UTC-5 (offsetMsWithSign = -300 minutes), we subtract -300 = add 300 minutes to UTC to get local time
  // If user is UTC+2 (offsetMsWithSign = +120 minutes), we subtract +120 = subtract 120 minutes from UTC to get local time
  // Formula: Local = UTC - offset (where offset is negative for UTC- and positive for UTC+)
  const userLocalTimestamp = utcTime.getTime() - offsetMsWithSign;
  const userLocalDate = new Date(userLocalTimestamp);
  
  // Extract components (these are in UTC but represent the user's local time)
  const components = {
    year: userLocalDate.getUTCFullYear(),
    month: userLocalDate.getUTCMonth(),
    day: userLocalDate.getUTCDate(),
    hours: userLocalDate.getUTCHours(),
    minutes: userLocalDate.getUTCMinutes(),
    seconds: userLocalDate.getUTCSeconds(),
    date: userLocalDate,
  };
  
  logger.debug({
    utcTime: utcTime.toISOString(),
    utcOffset,
    offsetMsWithSign,
    userLocalTime: `${components.hours}:${String(components.minutes).padStart(2, '0')} on ${components.year}-${components.month + 1}-${components.day}`,
    userLocalTimestamp: userLocalDate.toISOString(),
  }, 'Converted UTC to user local time');
  
  return components;
}

/**
 * Create a Date object representing a time in the user's local timezone
 * @param year - Year in user's local timezone
 * @param month - Month (0-11) in user's local timezone
 * @param day - Day in user's local timezone
 * @param hours - Hours (0-23) in user's local timezone
 * @param minutes - Minutes (0-59) in user's local timezone
 * @param timezone - User's timezone string (e.g., "Europe/Berlin", "America/New_York")
 * @returns Date object that represents the specified time in user's timezone
 */
function createDateInUserTimezone(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number,
  timezone: string
): Date {
  // Create a date string in ISO format
  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  // We need to create a Date object that, when converted to the user's timezone, gives us the desired time
  // Strategy: Use iterative approach to find the correct UTC timestamp
  
  // Start with a guess: assume the time is in UTC
  let candidate = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  
  // Check what this represents in the user's timezone
  let candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
  
  // Get components of what we got
  let gotYear = candidateInUserTz.getFullYear();
  let gotMonth = candidateInUserTz.getMonth();
  let gotDay = candidateInUserTz.getDate();
  let gotHours = candidateInUserTz.getHours();
  let gotMinutes = candidateInUserTz.getMinutes();
  
  // Calculate how far off we are
  const targetMs = new Date(year, month, day, hours, minutes, 0, 0).getTime();
  const gotMs = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
  const diff = targetMs - gotMs;
  
  // Adjust the candidate
  candidate = new Date(candidate.getTime() + diff);
  
  // Verify and fine-tune if needed (one more iteration)
  candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
  gotYear = candidateInUserTz.getFullYear();
  gotMonth = candidateInUserTz.getMonth();
  gotDay = candidateInUserTz.getDate();
  gotHours = candidateInUserTz.getHours();
  gotMinutes = candidateInUserTz.getMinutes();
  
  if (
    gotYear === year &&
    gotMonth === month &&
    gotDay === day &&
    gotHours === hours &&
    gotMinutes === minutes
  ) {
    return candidate;
  }
  
  // One more adjustment if needed
  const targetMs2 = new Date(year, month, day, hours, minutes, 0, 0).getTime();
  const gotMs2 = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
  const diff2 = targetMs2 - gotMs2;
  
  return new Date(candidate.getTime() + diff2);
}

/**
 * Check if a reminder should fire now based on user's local time
 * @param reminder - The reminder object
 * @param userLocalTime - Current time components in user's local timezone
 * @param userTimezone - User's timezone string (e.g., "Europe/Berlin")
 * @returns Object with shouldNotify flag and optional reminderTime
 */
function checkIfReminderShouldFire(
  reminder: any,
  userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
  userTimezone: string
): { shouldNotify: boolean; reason?: string; reminderTime?: Date } {
  if (!reminder.active) {
    return { shouldNotify: false, reason: 'Reminder is not active' };
  }

  const currentHour = userLocalTime.hours;
  const currentMinute = userLocalTime.minutes;
  const currentSecond = userLocalTime.seconds;
  const currentDay = userLocalTime.day;
  const currentMonth = userLocalTime.month;
  const currentYear = userLocalTime.year;
  const currentDayOfWeek = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day).getDay();

  try {
    if (reminder.frequency === 'daily') {
      if (!reminder.time) {
        return { shouldNotify: false, reason: 'No time specified for daily reminder' };
      }
      const [hours, minutes] = reminder.time.split(':').map(Number);
      // Check if current time matches reminder time (exact match or within 1 minute after)
      // Cron runs every minute, so we check if we're at the exact minute or 1 minute after
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const reminderTimeInMinutes = hours * 60 + minutes;
      const timeDiff = currentTimeInMinutes - reminderTimeInMinutes;
      // Fire if we're at the exact time (0) or 1 minute after (1) to account for cron timing
      if (timeDiff >= 0 && timeDiff <= 1) {
        const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, hours, minutes, userTimezone);
        return { shouldNotify: true, reason: 'Daily reminder time matches', reminderTime };
      }
      return { shouldNotify: false, reason: `Time doesn't match: current ${currentHour}:${String(currentMinute).padStart(2, '0')}, reminder ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}, diff ${timeDiff}` };
    } else if (reminder.frequency === 'hourly') {
      const minuteOfHour = Number(reminder.minuteOfHour ?? 0);
      // Check if current minute matches (exact or 1 minute after)
      const minuteDiff = currentMinute - minuteOfHour;
      if (minuteDiff >= 0 && minuteDiff <= 1) {
        const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, currentHour, minuteOfHour, userTimezone);
        return { shouldNotify: true, reason: 'Hourly reminder minute matches', reminderTime };
      }
      return { shouldNotify: false, reason: `Minute doesn't match: current ${currentMinute}, reminder ${minuteOfHour}, diff ${minuteDiff}` };
    } else if (reminder.frequency === 'minutely') {
      const interval = Math.max(1, Number(reminder.intervalMinutes ?? 1));
      // Check if current time is on the interval (exact match or 1 minute after)
      const remainder = currentMinute % interval;
      // Fire if remainder is 0 (exact) or 1 (1 minute after interval)
      if (remainder === 0 || remainder === 1) {
        const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, currentHour, currentMinute, userTimezone);
        return { shouldNotify: true, reason: 'Minutely reminder interval matches', reminderTime };
      }
      return { shouldNotify: false, reason: `Interval doesn't match: current minute ${currentMinute}, interval ${interval}, remainder ${remainder}` };
    } else if (reminder.frequency === 'weekly') {
      if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0 || !reminder.time) {
        return { shouldNotify: false, reason: 'Weekly reminder missing days or time' };
      }
      const [hours, minutes] = reminder.time.split(':').map(Number);
      // Check if today is one of the reminder days and time matches
      if (reminder.daysOfWeek.includes(currentDayOfWeek)) {
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const reminderTimeInMinutes = hours * 60 + minutes;
        const timeDiff = currentTimeInMinutes - reminderTimeInMinutes;
        // Fire if we're at the exact time or 1 minute after
        if (timeDiff >= 0 && timeDiff <= 1) {
          const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, hours, minutes, userTimezone);
          return { shouldNotify: true, reason: 'Weekly reminder day and time match', reminderTime };
        }
        return { shouldNotify: false, reason: `Day matches but time doesn't: current ${currentHour}:${String(currentMinute).padStart(2, '0')}, reminder ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}, diff ${timeDiff}` };
      }
      return { shouldNotify: false, reason: `Day doesn't match: current ${currentDayOfWeek}, reminder days ${reminder.daysOfWeek.join(',')}` };
    } else if (reminder.frequency === 'monthly') {
      if (!reminder.dayOfMonth) {
        return { shouldNotify: false, reason: 'Monthly reminder missing day of month' };
      }
      const dayOfMonth = Number(reminder.dayOfMonth);
      const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
      // Check if today is the reminder day and time matches
      if (currentDay === dayOfMonth) {
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const reminderTimeInMinutes = hours * 60 + minutes;
        const timeDiff = currentTimeInMinutes - reminderTimeInMinutes;
        // Fire if we're at the exact time or 1 minute after
        if (timeDiff >= 0 && timeDiff <= 1) {
          const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, hours, minutes, userTimezone);
          return { shouldNotify: true, reason: 'Monthly reminder day and time match', reminderTime };
        }
        return { shouldNotify: false, reason: `Day matches but time doesn't: current ${currentHour}:${String(currentMinute).padStart(2, '0')}, reminder ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}, diff ${timeDiff}` };
      }
      return { shouldNotify: false, reason: `Day doesn't match: current ${currentDay}, reminder ${dayOfMonth}` };
    } else if (reminder.frequency === 'yearly') {
      if (!reminder.month || !reminder.dayOfMonth) {
        return { shouldNotify: false, reason: 'Yearly reminder missing month or day' };
      }
      const month = Number(reminder.month);
      const dayOfMonth = Number(reminder.dayOfMonth);
      const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
      // Check if today is the reminder date and time matches
      // Note: month in reminder is 1-12, currentMonth is 0-11
      if (currentMonth === month - 1 && currentDay === dayOfMonth) {
        const currentTimeInMinutes = currentHour * 60 + currentMinute;
        const reminderTimeInMinutes = hours * 60 + minutes;
        const timeDiff = currentTimeInMinutes - reminderTimeInMinutes;
        // Fire if we're at the exact time or 1 minute after
        if (timeDiff >= 0 && timeDiff <= 1) {
          const reminderTime = createDateInUserTimezone(currentYear, currentMonth, currentDay, hours, minutes, userTimezone);
          return { shouldNotify: true, reason: 'Yearly reminder date and time match', reminderTime };
        }
        return { shouldNotify: false, reason: `Date matches but time doesn't: current ${currentHour}:${String(currentMinute).padStart(2, '0')}, reminder ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}, diff ${timeDiff}` };
      }
      return { shouldNotify: false, reason: `Date doesn't match: current ${currentMonth + 1}/${currentDay}, reminder ${month}/${dayOfMonth}` };
    } else if (reminder.frequency === 'once') {
      // For once reminders, check if today's date matches the target date and time
      logger.debug(
        {
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          hasTargetDate: !!reminder.targetDate,
          targetDate: reminder.targetDate ? new Date(reminder.targetDate).toISOString() : null,
          daysFromNow: reminder.daysFromNow,
          dayOfMonth: reminder.dayOfMonth,
          month: reminder.month,
          time: reminder.time,
          currentYear,
          currentMonth,
          currentDay,
          currentHour,
          currentMinute,
        },
        'Checking one-time reminder'
      );
      
      let targetYear: number;
      let targetMonth: number; // 0-11
      let targetDay: number;
      let targetHours: number;
      let targetMinutes: number;
      
      if (reminder.targetDate) {
        // Get target date components in user's timezone
        const targetDateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });
        
        const targetParts = targetDateFormatter.formatToParts(new Date(reminder.targetDate));
        const getPart = (type: string) => targetParts.find(p => p.type === type)?.value || '0';
        
        targetYear = parseInt(getPart('year'), 10);
        targetMonth = parseInt(getPart('month'), 10) - 1; // Convert to 0-11
        targetDay = parseInt(getPart('day'), 10);
        
        // Use reminder.time if specified, otherwise use time from targetDate
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          targetHours = hours;
          targetMinutes = minutes;
        } else {
          targetHours = parseInt(getPart('hour'), 10);
          targetMinutes = parseInt(getPart('minute'), 10);
        }
      } else if (reminder.daysFromNow !== undefined) {
        // Calculate target date from daysFromNow
        // daysFromNow is relative to when the reminder was created
        // Use createdAt if available, otherwise use current date as fallback
        const reminderCreatedAt = (reminder as any).createdAt ? new Date((reminder as any).createdAt) : userLocalTime.date;
        
        // Get creation date components in user's timezone
        const createdFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour12: false,
        });
        
        const createdParts = createdFormatter.formatToParts(reminderCreatedAt);
        const getCreatedPart = (type: string) => createdParts.find(p => p.type === type)?.value || '0';
        
        const createdYear = parseInt(getCreatedPart('year'), 10);
        const createdMonth = parseInt(getCreatedPart('month'), 10) - 1; // Convert to 0-11
        const createdDay = parseInt(getCreatedPart('day'), 10);
        
        // Calculate target date by adding daysFromNow to creation date
        // Create a date object in user's timezone, add days, then extract components
        const targetDateObj = new Date(Date.UTC(createdYear, createdMonth, createdDay + reminder.daysFromNow));
        targetYear = targetDateObj.getUTCFullYear();
        targetMonth = targetDateObj.getUTCMonth();
        targetDay = targetDateObj.getUTCDate();
        
        // Use reminder.time if specified, otherwise default to 9:00 AM
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          targetHours = hours;
          targetMinutes = minutes;
        } else {
          targetHours = 9;
          targetMinutes = 0;
        }
      } else if (reminder.dayOfMonth && reminder.month) {
        // Specific date (month + dayOfMonth)
        targetYear = currentYear;
        targetMonth = reminder.month - 1; // Convert 1-12 to 0-11
        targetDay = reminder.dayOfMonth;
        
        // Check if this year's date has passed
        const thisYearDate = createDateInUserTimezone(targetYear, targetMonth, targetDay, 9, 0, userTimezone);
        if (thisYearDate < userLocalTime.date) {
          targetYear += 1;
        }
        
        // Use reminder.time if specified, otherwise default to 9:00 AM
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          targetHours = hours;
          targetMinutes = minutes;
        } else {
          targetHours = 9;
          targetMinutes = 0;
        }
      } else {
        return { shouldNotify: false, reason: 'Once reminder missing targetDate, daysFromNow, or dayOfMonth/month' };
      }
      
      // Check if today's date matches the target date (in user's timezone)
      const dateMatches = targetYear === currentYear && 
                          targetMonth === currentMonth && 
                          targetDay === currentDay;
      
      logger.debug(
        {
          reminderId: reminder.id,
          targetYear,
          targetMonth: targetMonth + 1,
          targetDay,
          targetHours,
          targetMinutes,
          currentYear,
          currentMonth: currentMonth + 1,
          currentDay,
          currentHour,
          currentMinute,
          dateMatches,
        },
        'One-time reminder date check'
      );
      
      if (!dateMatches) {
        return { 
          shouldNotify: false, 
          reason: `Date doesn't match: current ${currentYear}-${currentMonth + 1}-${currentDay}, target ${targetYear}-${targetMonth + 1}-${targetDay}` 
        };
      }
      
      // Date matches, now check if time matches (using same logic as daily reminders)
      const currentTimeInMinutes = currentHour * 60 + currentMinute;
      const targetTimeInMinutes = targetHours * 60 + targetMinutes;
      const timeDiff = currentTimeInMinutes - targetTimeInMinutes;
      
      logger.debug(
        {
          reminderId: reminder.id,
          currentTimeInMinutes,
          targetTimeInMinutes,
          timeDiff,
          willFire: timeDiff >= 0 && timeDiff <= 1,
        },
        'One-time reminder time check'
      );
      
      // Fire if we're at the exact time (0) or 1 minute after (1) to account for cron timing
      if (timeDiff >= 0 && timeDiff <= 1) {
        const reminderTime = createDateInUserTimezone(targetYear, targetMonth, targetDay, targetHours, targetMinutes, userTimezone);
        logger.info(
          {
            reminderId: reminder.id,
            reminderTitle: reminder.title,
            targetYear,
            targetMonth: targetMonth + 1,
            targetDay,
            targetHours,
            targetMinutes,
            reminderTime: reminderTime.toISOString(),
          },
          'One-time reminder is due - will fire'
        );
        return { shouldNotify: true, reason: 'Once reminder date and time match', reminderTime };
      }
      
      return { 
        shouldNotify: false, 
        reason: `Date matches but time doesn't: current ${currentHour}:${String(currentMinute).padStart(2, '0')}, target ${String(targetHours).padStart(2, '0')}:${String(targetMinutes).padStart(2, '0')}, diff ${timeDiff}` 
      };
    }

    return { shouldNotify: false, reason: `Unknown frequency: ${reminder.frequency}` };
  } catch (error) {
    logger.error({ error, reminderId: reminder.id, frequency: reminder.frequency }, 'Error checking if reminder should fire');
    return { shouldNotify: false, reason: 'Error checking reminder' };
  }
}

/**
 * Calculate the actual time when the reminder should occur (not 5 minutes before)
 * This is the time the user wants to be reminded about
 * @param reminder - The reminder object
 * @param userLocalTime - Current time components in user's local timezone
 * @param userTimezone - User's timezone string (e.g., "Europe/Berlin")
 */
function calculateReminderTime(reminder: any, userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date }, userTimezone: string): Date | null {
  try {
    if (reminder.frequency === 'once') {
      if (reminder.targetDate) {
        // targetDate is already a Date object that was created using createDateInUserTimezone
        // It represents the exact moment in time when the reminder should fire
        // We just need to use it directly, but if reminder.time is specified, we should use that time instead
        const target = new Date(reminder.targetDate);
        
        // Get the date components in user's timezone
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });
        
        const parts = formatter.formatToParts(target);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
        
        const targetYear = parseInt(getPart('year'), 10);
        const targetMonth = parseInt(getPart('month'), 10) - 1; // Month is 0-indexed
        const targetDay = parseInt(getPart('day'), 10);
        
        // Use the time from reminder.time if specified, otherwise use the time from targetDate
        let hours: number;
        let minutes: number;
        
        if (reminder.time) {
          const timeParts = reminder.time.split(':');
          hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
          minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        } else {
          // Extract time from targetDate in user's timezone
          hours = parseInt(getPart('hour'), 10);
          minutes = parseInt(getPart('minute'), 10);
        }
        
        // Create the reminder time in user's timezone
        const reminderTime = createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
        
        // If reminder time is in the past (more than 1 minute), return null
        const oneMinuteAgo = new Date(userLocalTime.date.getTime() - 60 * 1000);
        if (reminderTime < oneMinuteAgo) {
          return null;
        }
        
        return reminderTime;
      } else if (reminder.daysFromNow !== undefined) {
        const nextDay = userLocalTime.day + reminder.daysFromNow;
        const nextDate = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, nextDay));
        // Handle month/year overflow
        const actualYear = nextDate.getUTCFullYear();
        const actualMonth = nextDate.getUTCMonth();
        const actualDay = nextDate.getUTCDate();
        
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          const reminderTimeUtc = createDateInUserTimezone(actualYear, actualMonth, actualDay, hours, minutes, userTimezone);
          const oneMinuteAgo = new Date(userLocalTime.date.getTime() - 60 * 1000);
          if (reminderTimeUtc < oneMinuteAgo) {
            return null; // Already passed
          }
          return reminderTimeUtc;
        } else {
          // Default to 9am if no time specified
          return createDateInUserTimezone(actualYear, actualMonth, actualDay, 9, 0, userTimezone);
        }
      } else if (reminder.dayOfMonth && reminder.month) {
        // This is for "once" reminders with specific date
        let nextYear = userLocalTime.year;
        let nextMonth = reminder.month - 1; // Convert 1-12 to 0-11
        let nextDay = reminder.dayOfMonth;
        
        // Check if this year's date has passed
        let checkHours = 9;
        let checkMinutes = 0;
        if (reminder.time) {
          const timeParts = reminder.time.split(':');
          checkHours = timeParts[0] ? parseInt(timeParts[0], 10) : 9;
          checkMinutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        }
        const thisYearDate = createDateInUserTimezone(nextYear, nextMonth, nextDay, checkHours, checkMinutes, userTimezone);
        if (thisYearDate < userLocalTime.date) {
          nextYear += 1;
        }
        
        if (reminder.time) {
          const timeParts = reminder.time.split(':');
          const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
          const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
          return createDateInUserTimezone(nextYear, nextMonth, nextDay, hours, minutes, userTimezone);
        } else {
          return createDateInUserTimezone(nextYear, nextMonth, nextDay, 9, 0, userTimezone);
        }
      }
      return null; // Can't calculate
    } else if (reminder.frequency === 'daily') {
      if (reminder.time) {
        const timeParts = reminder.time.split(':');
        const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
        const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        
        // Check if reminder time today has passed
        const todayReminder = createDateInUserTimezone(userLocalTime.year, userLocalTime.month, userLocalTime.day, hours, minutes, userTimezone);
        const currentMinute = new Date(userLocalTime.date);
        currentMinute.setUTCSeconds(0, 0);
        
        if (todayReminder < currentMinute) {
          // Reminder time today has passed, move to tomorrow
          const tomorrow = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1));
          return createDateInUserTimezone(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), hours, minutes, userTimezone);
        }
        return todayReminder;
      } else {
        // No time specified, default to tomorrow at 9am
        const tomorrow = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1));
        return createDateInUserTimezone(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), 9, 0, userTimezone);
      }
    } else if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
      return getNextWeeklyOccurrence(userLocalTime, reminder.daysOfWeek[0], reminder.time || undefined, userTimezone);
    } else if (reminder.frequency === 'monthly' && reminder.dayOfMonth) {
      let nextYear = userLocalTime.year;
      let nextMonth = userLocalTime.month;
      let nextDay = reminder.dayOfMonth;
      
      // Check if this month's date has passed
      let checkHours = 9;
      let checkMinutes = 0;
      if (reminder.time) {
        const timeParts = reminder.time.split(':');
        checkHours = timeParts[0] ? parseInt(timeParts[0], 10) : 9;
        checkMinutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
      }
      const thisMonthDate = createDateInUserTimezone(nextYear, nextMonth, nextDay, checkHours, checkMinutes, userTimezone);
      if (thisMonthDate <= userLocalTime.date) {
        // Move to next month
        nextMonth += 1;
        if (nextMonth > 11) {
          nextMonth = 0;
          nextYear += 1;
        }
        // Handle day overflow (e.g., Jan 31 -> Feb doesn't have 31st)
        const lastDayOfMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
        nextDay = Math.min(reminder.dayOfMonth, lastDayOfMonth);
      }
      
      if (reminder.time) {
        const timeParts = reminder.time.split(':');
        const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
        const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        return createDateInUserTimezone(nextYear, nextMonth, nextDay, hours, minutes, userTimezone);
      } else {
        return createDateInUserTimezone(nextYear, nextMonth, nextDay, 9, 0, userTimezone);
      }
    } else if (reminder.frequency === 'yearly' && reminder.dayOfMonth && reminder.month) {
      let nextYear = userLocalTime.year;
      const nextMonth = reminder.month - 1; // Convert 1-12 to 0-11
      let nextDay = reminder.dayOfMonth;
      
      // Check if this year's date has passed
      let checkHours = 9;
      let checkMinutes = 0;
      if (reminder.time) {
        const timeParts = reminder.time.split(':');
        checkHours = timeParts[0] ? parseInt(timeParts[0], 10) : 9;
        checkMinutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
      }
      const thisYearDate = createDateInUserTimezone(nextYear, nextMonth, nextDay, checkHours, checkMinutes, userTimezone);
      if (thisYearDate < userLocalTime.date) {
        nextYear += 1;
        // Recalculate day for next year (handle leap years)
        const lastDayOfMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
        nextDay = Math.min(reminder.dayOfMonth, lastDayOfMonth);
      }
      
      if (reminder.time) {
        const timeParts = reminder.time.split(':');
        const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
        const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        return createDateInUserTimezone(nextYear, nextMonth, nextDay, hours, minutes, userTimezone);
      } else {
        return createDateInUserTimezone(nextYear, nextMonth, nextDay, 9, 0, userTimezone);
      }
    } else if (reminder.frequency === 'hourly' && reminder.minuteOfHour !== undefined && reminder.minuteOfHour !== null) {
      let nextYear = userLocalTime.year;
      let nextMonth = userLocalTime.month;
      let nextDay = userLocalTime.day;
      let nextHour = userLocalTime.hours;
      const nextMinute = reminder.minuteOfHour;
      
      // Check if this hour's minute has passed
      if (userLocalTime.minutes >= nextMinute) {
        // Move to next hour
        nextHour += 1;
        if (nextHour >= 24) {
          nextHour = 0;
          nextDay += 1;
          // Handle day overflow
          const daysInMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
          if (nextDay > daysInMonth) {
            nextDay = 1;
            nextMonth += 1;
            if (nextMonth > 11) {
              nextMonth = 0;
              nextYear += 1;
            }
          }
        }
      }
      
      return createDateInUserTimezone(nextYear, nextMonth, nextDay, nextHour, nextMinute, userTimezone);
    } else if (reminder.frequency === 'minutely' && reminder.intervalMinutes !== undefined && reminder.intervalMinutes !== null) {
      const interval = reminder.intervalMinutes;
      const currentMinutes = userLocalTime.hours * 60 + userLocalTime.minutes;
      const nextMinutes = currentMinutes + interval;
      
      let nextYear = userLocalTime.year;
      let nextMonth = userLocalTime.month;
      let nextDay = userLocalTime.day;
      let nextHour = Math.floor(nextMinutes / 60);
      const nextMinute = nextMinutes % 60;
      
      // Handle hour/day overflow
      if (nextHour >= 24) {
        nextHour = nextHour % 24;
        nextDay += 1;
        const daysInMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
        if (nextDay > daysInMonth) {
          nextDay = 1;
          nextMonth += 1;
          if (nextMonth > 11) {
            nextMonth = 0;
            nextYear += 1;
          }
        }
      }
      
      return createDateInUserTimezone(nextYear, nextMonth, nextDay, nextHour, nextMinute, userTimezone);
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
function calculateNextOccurrence(reminder: any, userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date }, userTimezone: string): Date | null {
  return calculateReminderTime(reminder, userLocalTime, userTimezone);
}

/**
 * Get next weekly occurrence
 */
function getNextWeeklyOccurrence(userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date }, dayOfWeek: number, time: string | undefined, userTimezone: string): Date {
  // Get current day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
  // We need to calculate this from the user's local time
  const currentDate = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, userLocalTime.day));
  const currentDayOfWeek = currentDate.getUTCDay();
  
  let daysUntilNext = dayOfWeek - currentDayOfWeek;
  
  if (daysUntilNext < 0) {
    daysUntilNext += 7;
  } else if (daysUntilNext === 0) {
    // Same day - check if time has passed
    if (time) {
      const timeParts = time.split(':');
      const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
      const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
      const todayAtTime = createDateInUserTimezone(userLocalTime.year, userLocalTime.month, userLocalTime.day, hours, minutes, userTimezone);
      if (todayAtTime <= userLocalTime.date) {
        daysUntilNext = 7; // Next week
      } else {
        return todayAtTime; // Today, same day
      }
    } else {
      // No time specified, default to 9am
      const todayAtTime = createDateInUserTimezone(userLocalTime.year, userLocalTime.month, userLocalTime.day, 9, 0, userTimezone);
      if (todayAtTime <= userLocalTime.date) {
        daysUntilNext = 7; // Next week
      } else {
        return todayAtTime; // Today, same day
      }
    }
  }
  
  // Calculate the next occurrence date
  const nextDate = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, userLocalTime.day + daysUntilNext));
  const nextYear = nextDate.getUTCFullYear();
  const nextMonth = nextDate.getUTCMonth();
  const nextDay = nextDate.getUTCDate();
  
  if (time) {
    const timeParts = time.split(':');
    const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
    const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
        return createDateInUserTimezone(nextYear, nextMonth, nextDay, hours, minutes, userTimezone);
  } else {
    return createDateInUserTimezone(nextYear, nextMonth, nextDay, 9, 0, userTimezone); // Default to 9am
  }
}

/**
 * Format time string to 12-hour format
 */
function formatTime(timeStr: string): string {
  const timeParts = timeStr.split(':');
  const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
  const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
  const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Format reminder time from local time components
 */
function formatReminderTimeFromComponents(localTime: { year: number; month: number; day: number; hours: number; minutes: number; date: Date }, currentUtc: Date, userUtcOffset?: string): string {
  const hours = localTime.hours;
  const minutes = localTime.minutes;
  const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  const period = hours >= 12 ? 'PM' : 'AM';
  
  // Check if it's today in user's timezone
  let isToday = false;
  if (userUtcOffset) {
    const currentLocalTime = getLocalTimeComponents(currentUtc, userUtcOffset);
    isToday = localTime.year === currentLocalTime.year &&
               localTime.month === currentLocalTime.month &&
               localTime.day === currentLocalTime.day;
  }
  
  if (isToday) {
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  } else {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    // Calculate day of week from the date components
    const dateObj = new Date(Date.UTC(localTime.year, localTime.month, localTime.day));
    const dayName = dayNames[dateObj.getUTCDay()];
    const monthName = monthNames[localTime.month];
    const day = localTime.day;
    return `${dayName}, ${monthName} ${day} at ${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
  }
}

/**
 * Format a Date object to a readable time string (for backward compatibility)
 */
function formatReminderTime(date: Date): string {
  // This is a fallback - should use formatReminderTimeFromComponents instead
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
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

/**
 * Format a Date object to a readable date string (for reminder dates)
 */
function formatReminderDate(date: Date): string {
  return date.toLocaleDateString([], {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get relative time until a date (e.g., "in 2 hours", "in 3 days", "now")
 */
function getRelativeTimeUntil(targetDate: Date, currentDate: Date): string {
  const timeMs = targetDate.getTime() - currentDate.getTime();
  
  if (timeMs < 0) {
    return 'Already passed';
  }
  
  if (timeMs < 60000) { // Less than 1 minute
    return 'now';
  }
  
  const totalSeconds = Math.floor(timeMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  
  if (days > 0) {
    if (hours === 0) {
      return `in ${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return `in ${days} ${days === 1 ? 'day' : 'days'} and ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  
  if (totalHours > 0) {
    if (minutes === 0) {
      return `in ${totalHours} ${totalHours === 1 ? 'hour' : 'hours'}`;
    }
    return `in ${totalHours} ${totalHours === 1 ? 'hour' : 'hours'} and ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }
  
  return `in ${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Format time difference in milliseconds to human-readable string (X days, X hours, X minutes)
 */
function formatTimeUntil(timeMs: number): string {
  if (timeMs < 0) {
    return 'Already passed';
  }
  
  const totalSeconds = Math.floor(timeMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;
  
  const parts: string[] = [];
  
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  if (parts.length === 0 && seconds > 0) {
    parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  }
  
  if (parts.length === 0) {
    return 'Now';
  }
  
  return parts.join(', ');
}

/**
 * Get display name for reminder frequency
 */
function getFrequencyDisplayName(frequency: string): string {
  const frequencyMap: Record<string, string> = {
    'once': 'One-time',
    'daily': 'Daily',
    'weekly': 'Weekly',
    'monthly': 'Monthly',
    'yearly': 'Yearly',
    'hourly': 'Hourly',
    'minutely': 'Every N minutes',
  };
  return frequencyMap[frequency] || frequency;
}

