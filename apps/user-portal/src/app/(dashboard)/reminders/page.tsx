"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Plus,
  Trash2,
  Pencil,
  Search,
  MoreVertical,
  BellRing,
  Calendar as CalendarIcon,
  Filter,
  X,
} from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, isSameDay, isWithinInterval, parseISO } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@imaginecalendar/ui/popover";
import { Calendar } from "@imaginecalendar/ui/calendar";

// DateRange type definition (matching react-day-picker)
type DateRange = {
  from: Date | undefined;
  to: Date | undefined;
};
import { Button } from "@imaginecalendar/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@imaginecalendar/ui/card";
import { Input } from "@imaginecalendar/ui/input";
import { Label } from "@imaginecalendar/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@imaginecalendar/ui/select";
import { Switch } from "@imaginecalendar/ui/switch";
import { Badge } from "@imaginecalendar/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@imaginecalendar/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@imaginecalendar/ui/alert-dialog";
import { useToast } from "@imaginecalendar/ui/use-toast";
import Link from "next/link";
import { Home, ChevronLeft, Clock } from "lucide-react";

// ==================== TYPES ====================

type ReminderFrequency = "daily" | "hourly" | "minutely" | "once" | "weekly" | "monthly" | "yearly";

interface Reminder {
  id: string;
  title: string;
  frequency: ReminderFrequency;
  time: string | null; // HH:MM format for daily/weekly
  minuteOfHour: number | null; // 0-59 for hourly
  intervalMinutes: number | null; // for minutely
  daysFromNow: number | null; // for once reminders
  targetDate: Date | null; // for once reminders
  dayOfMonth: number | null; // for monthly/yearly reminders
  month: number | null; // for yearly reminders
  daysOfWeek: number[] | null; // Array of integers 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday) for weekly
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface ReminderFormData {
  id: string | null;
  title: string;
  frequency: ReminderFrequency;
  time: string;
  minuteOfHour: number;
  intervalMinutes: number;
  daysFromNow: number;
  targetDate: string; // ISO date string for datetime-local input
  dayOfMonth: number;
  month: number;
  daysOfWeek: number[]; // Array of integers 0-6 (0=Sunday, 1=Monday, ..., 6=Saturday) for weekly
  active: boolean;
}

// ==================== UTILITY FUNCTIONS ====================

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/**
 * Create a Date object representing a specific time today in the user's timezone
 */
function parseTimeStringToToday(timeStr: string, timezone?: string): Date {
  const parts = timeStr.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;

  if (timezone) {
    // Get current date/time in user's timezone
    const now = new Date();
    const userNowString = now.toLocaleString("en-US", { timeZone: timezone });
    const userNow = new Date(userNowString);

    // Create date with today's date and the specified time in user's timezone
    const year = userNow.getFullYear();
    const month = userNow.getMonth();
    const day = userNow.getDate();

    // Create a date string in ISO format
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

    // Create date as UTC first
    let candidate = new Date(Date.UTC(year, month, day, h, m, 0, 0));

    // Check what this represents in user's timezone
    let candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
    let gotYear = candidateInUserTz.getFullYear();
    let gotMonth = candidateInUserTz.getMonth();
    let gotDay = candidateInUserTz.getDate();
    let gotHours = candidateInUserTz.getHours();
    let gotMinutes = candidateInUserTz.getMinutes();

    // Calculate offset
    const targetMs = new Date(year, month, day, h, m, 0, 0).getTime();
    const gotMs = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
    const diff = targetMs - gotMs;

    return new Date(candidate.getTime() + diff);
  }

  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(h, m, 0, 0);
  return d;
}

function nextForDaily(timeStr: string, from: Date = new Date(), timezone?: string): Date {
  if (timezone) {
    // Get current time in user's timezone
    const fromInUserTz = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const parts = timeStr.split(":").map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;

    // Create target time today in user's timezone
    const year = fromInUserTz.getFullYear();
    const month = fromInUserTz.getMonth();
    const day = fromInUserTz.getDate();

    // Create date representing the target time in user's timezone
    let candidate = new Date(Date.UTC(year, month, day, h, m, 0, 0));
    let candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
    let gotYear = candidateInUserTz.getFullYear();
    let gotMonth = candidateInUserTz.getMonth();
    let gotDay = candidateInUserTz.getDate();
    let gotHours = candidateInUserTz.getHours();
    let gotMinutes = candidateInUserTz.getMinutes();

    const targetMs = new Date(year, month, day, h, m, 0, 0).getTime();
    const gotMs = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
    const diff = targetMs - gotMs;
    const target = new Date(candidate.getTime() + diff);

    // Compare times
    if (target.getTime() <= from.getTime()) {
      // Move to tomorrow in user's timezone
      const tomorrowInUserTz = new Date(fromInUserTz);
      tomorrowInUserTz.setDate(tomorrowInUserTz.getDate() + 1);

      const tomorrowYear = tomorrowInUserTz.getFullYear();
      const tomorrowMonth = tomorrowInUserTz.getMonth();
      const tomorrowDay = tomorrowInUserTz.getDate();

      candidate = new Date(Date.UTC(tomorrowYear, tomorrowMonth, tomorrowDay, h, m, 0, 0));
      candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
      gotYear = candidateInUserTz.getFullYear();
      gotMonth = candidateInUserTz.getMonth();
      gotDay = candidateInUserTz.getDate();
      gotHours = candidateInUserTz.getHours();
      gotMinutes = candidateInUserTz.getMinutes();

      const targetMs2 = new Date(tomorrowYear, tomorrowMonth, tomorrowDay, h, m, 0, 0).getTime();
      const gotMs2 = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
      const diff2 = targetMs2 - gotMs2;
      return new Date(candidate.getTime() + diff2);
    }
    return target;
  }

  const target = parseTimeStringToToday(timeStr);
  if (target <= from) {
    const t = new Date(target);
    t.setDate(t.getDate() + 1);
    return t;
  }
  return target;
}

function nextForHourly(minuteOfHour: number = 0, from: Date = new Date(), timezone?: string): Date {
  if (timezone) {
    const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const d = new Date(fromInTimezone);
    d.setSeconds(0, 0);
    const minute = minuteOfHour ?? 0;
    if (d.getMinutes() < minute) {
      d.setMinutes(minute, 0, 0);
    } else {
      d.setHours(d.getHours() + 1, minute, 0, 0);
    }
    return d;
  }

  const d = new Date(from);
  d.setSeconds(0, 0);
  const minute = minuteOfHour ?? 0;
  if (d.getMinutes() < minute) {
    d.setMinutes(minute, 0, 0);
  } else {
    d.setHours(d.getHours() + 1, minute, 0, 0);
  }
  return d;
}

function nextForMinutely(interval: number = 1, from: Date = new Date(), timezone?: string): Date {
  if (timezone) {
    const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const d = new Date(fromInTimezone);
    d.setSeconds(0, 0);
    const mins = d.getMinutes();
    const remainder = mins % interval;
    if (remainder === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0 && fromInTimezone < d)
      return d;
    const add = remainder === 0 ? interval : interval - remainder;
    d.setMinutes(mins + add, 0, 0);
    return d;
  }

  const d = new Date(from);
  d.setSeconds(0, 0);
  const mins = d.getMinutes();
  const remainder = mins % interval;
  if (remainder === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0 && from < d)
    return d;
  const add = remainder === 0 ? interval : interval - remainder;
  d.setMinutes(mins + add, 0, 0);
  return d;
}

function nextForOnce(daysFromNow: number | null, targetDate: Date | null, from: Date = new Date(), timezone?: string): Date | null {
  if (targetDate) {
    const target = new Date(targetDate);
    if (timezone) {
      const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
      const targetInTimezone = new Date(target.toLocaleString("en-US", { timeZone: timezone }));
      return targetInTimezone > fromInTimezone ? target : null;
    }
    return target > from ? target : null;
  }
  if (daysFromNow !== null) {
    if (timezone) {
      const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
      const d = new Date(fromInTimezone);
      d.setDate(d.getDate() + daysFromNow);
      d.setHours(9, 0, 0, 0); // Default to 9 AM
      return d;
    }
    const d = new Date(from);
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(9, 0, 0, 0); // Default to 9 AM
    return d;
  }
  return null;
}

function nextForMonthly(dayOfMonth: number, time: string | null, from: Date = new Date(), timezone?: string): Date {
  if (timezone) {
    const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const d = new Date(fromInTimezone);
    const targetDay = Math.min(dayOfMonth, 31);
    const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];

    // Set to this month first
    d.setDate(targetDay);
    d.setHours(hours ?? 9, minutes ?? 0, 0, 0);

    // If the date has passed this month, move to next month
    if (d <= fromInTimezone) {
      d.setMonth(d.getMonth() + 1);
      // Handle edge case where day doesn't exist in next month (e.g., Feb 31)
      const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (targetDay > lastDayOfMonth) {
        d.setDate(lastDayOfMonth);
      } else {
        d.setDate(targetDay);
      }
    }
    return d;
  }

  const d = new Date(from);
  const targetDay = Math.min(dayOfMonth, 31);
  const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];

  // Set to this month first
  d.setDate(targetDay);
  d.setHours(hours ?? 9, minutes ?? 0, 0, 0);

  // If the date has passed this month, move to next month
  if (d <= from) {
    d.setMonth(d.getMonth() + 1);
    // Handle edge case where day doesn't exist in next month (e.g., Feb 31)
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (targetDay > lastDayOfMonth) {
      d.setDate(lastDayOfMonth);
    } else {
      d.setDate(targetDay);
    }
  }

  return d;
}

function nextForYearly(month: number, dayOfMonth: number, time: string | null, from: Date = new Date(), timezone?: string): Date {
  if (timezone) {
    const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const d = new Date(fromInTimezone);
    const targetDay = Math.min(dayOfMonth, 31);
    const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];

    // Set to this year first
    d.setMonth(month - 1); // month is 1-12, setMonth expects 0-11
    const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, lastDayOfMonth));
    d.setHours(hours ?? 9, minutes ?? 0, 0, 0);

    // If the date has passed this year, move to next year
    if (d <= fromInTimezone) {
      d.setFullYear(d.getFullYear() + 1);
      // Recalculate last day of month for next year
      const nextYearLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      d.setDate(Math.min(targetDay, nextYearLastDay));
    }
    return d;
  }

  const d = new Date(from);
  const targetDay = Math.min(dayOfMonth, 31);
  const [hours, minutes] = time ? time.split(":").map(Number) : [9, 0];

  // Set to this year first
  d.setMonth(month - 1); // month is 1-12, setMonth expects 0-11
  const lastDayOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(targetDay, lastDayOfMonth));
  d.setHours(hours ?? 9, minutes ?? 0, 0, 0);

  // If the date has passed this year, move to next year
  if (d <= from) {
    d.setFullYear(d.getFullYear() + 1);
    // Recalculate last day of month for next year
    const nextYearLastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, nextYearLastDay));
  }

  return d;
}

function nextForWeekly(daysOfWeek: number[], time: string, from: Date = new Date(), timezone?: string): Date | null {
  if (!daysOfWeek || daysOfWeek.length === 0 || !time) return null;

  if (timezone) {
    const fromInTimezone = new Date(from.toLocaleString("en-US", { timeZone: timezone }));
    const [hours, minutes] = time.split(":").map(Number);
    const currentDayOfWeek = fromInTimezone.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const currentTime = fromInTimezone.getHours() * 60 + fromInTimezone.getMinutes();
    const targetTime = (hours ?? 0) * 60 + (minutes ?? 0);

    // Sort days of week
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

    // Find the next day this week
    for (const day of sortedDays) {
      if (day > currentDayOfWeek) {
        const d = new Date(fromInTimezone);
        const daysToAdd = day - currentDayOfWeek;
        d.setDate(d.getDate() + daysToAdd);
        d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
        return d;
      }
      // If same day, check if time hasn't passed
      if (day === currentDayOfWeek && targetTime > currentTime) {
        const d = new Date(fromInTimezone);
        d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
        return d;
      }
    }

    // If no day found this week, use the first day of next week
    const firstDay = sortedDays[0]!;
    const d = new Date(fromInTimezone);
    // Calculate days until next week's first day
    const daysUntilNextWeek = 7 - currentDayOfWeek;
    const daysToAdd = daysUntilNextWeek + firstDay;
    d.setDate(d.getDate() + daysToAdd);
    d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return d;
  }

  const [hours, minutes] = time.split(":").map(Number);
  const currentDayOfWeek = from.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  const currentTime = from.getHours() * 60 + from.getMinutes();
  const targetTime = (hours ?? 0) * 60 + (minutes ?? 0);

  // Sort days of week
  const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

  // Find the next day this week
  for (const day of sortedDays) {
    if (day > currentDayOfWeek) {
      const d = new Date(from);
      const daysToAdd = day - currentDayOfWeek;
      d.setDate(d.getDate() + daysToAdd);
      d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
      return d;
    }
    // If same day, check if time hasn't passed
    if (day === currentDayOfWeek && targetTime > currentTime) {
      const d = new Date(from);
      d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
      return d;
    }
  }

  // If no day found this week, use the first day of next week
  const firstDay = sortedDays[0]!;
  const d = new Date(from);
  // Calculate days until next week's first day
  const daysUntilNextWeek = 7 - currentDayOfWeek;
  const daysToAdd = daysUntilNextWeek + firstDay;
  d.setDate(d.getDate() + daysToAdd);
  d.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return d;
}

function computeNext(reminder: Reminder, from: Date = new Date(), timezone?: string): Date | null {
  if (!reminder.active) return null;
  switch (reminder.frequency) {
    case "daily":
      return nextForDaily(reminder.time || "09:00", from, timezone);
    case "hourly":
      return nextForHourly(Number(reminder.minuteOfHour ?? 0), from, timezone);
    case "minutely":
      return nextForMinutely(Math.max(1, Number(reminder.intervalMinutes ?? 1)), from, timezone);
    case "once":
      return nextForOnce(reminder.daysFromNow, reminder.targetDate, from, timezone);
    case "weekly":
      return nextForWeekly(reminder.daysOfWeek || [], reminder.time || "09:00", from, timezone);
    case "monthly":
      return nextForMonthly(Number(reminder.dayOfMonth ?? 1), reminder.time, from, timezone);
    case "yearly":
      return nextForYearly(
        Number(reminder.month ?? 1),
        Number(reminder.dayOfMonth ?? 1),
        reminder.time,
        from,
        timezone
      );
    default:
      return null;
  }
}

function formatDateTime(d: Date | null, timezone?: string): string {
  if (!d) return "";
  if (timezone) {
    const userTime = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
    const hh = pad(userTime.getHours());
    const mm = pad(userTime.getMinutes());
    return `${userTime.toLocaleDateString()} ${hh}:${mm}`;
  }
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${d.toLocaleDateString()} ${hh}:${mm}`;
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (hours > 1) return `in ${hours} hours`;
  if (hours === 1) return "in 1 hour";
  if (minutes > 1) return `in ${minutes} minutes`;
  if (minutes === 1) return "in 1 minute";
  if (seconds > 0) return "in a few seconds";
  return "now";
}

function getFrequencyDescription(reminder: Reminder): string {
  switch (reminder.frequency) {
    case "daily":
      return `Every day at ${reminder.time || "00:00"}`;
    case "hourly":
      return `Every hour at :${pad(reminder.minuteOfHour || 0)}`;
    case "minutely":
      return `Every ${reminder.intervalMinutes || 5} minute${(reminder.intervalMinutes || 5) > 1 ? 's' : ''}`;
    case "once":
      if (reminder.targetDate) {
        const target = new Date(reminder.targetDate);
        return `On ${target.toLocaleDateString()} at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }
      if (reminder.daysFromNow !== null) {
        const days = reminder.daysFromNow;
        if (days === 0) return "Today";
        if (days === 1) return "Tomorrow";
        return `In ${days} day${days > 1 ? 's' : ''}`;
      }
      return "One-time reminder";
    case "weekly":
      if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
        return "Weekly (no days selected)";
      }
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const selectedDays = reminder.daysOfWeek
        .sort((a, b) => a - b)
        .map(day => dayNames[day])
        .join(", ");
      return `Every ${selectedDays} at ${reminder.time || "00:00"}`;
    case "monthly":
      const day = reminder.dayOfMonth || 1;
      const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
      return `On the ${day}${suffix} of every month${reminder.time ? ` at ${reminder.time}` : ''}`;
    case "yearly":
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const m = reminder.month || 1;
      const d = reminder.dayOfMonth || 1;
      const daySuffix = d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th";
      return `Every year on ${monthNames[m - 1]} ${d}${daySuffix}${reminder.time ? ` at ${reminder.time}` : ''}`;
    default:
      return "";
  }
}

/**
 * Check if a reminder can occur on a specific date based on its frequency pattern
 */
function canReminderOccurOnDate(
  reminder: Reminder,
  checkDate: Date,
  timezone?: string
): boolean {
  // Get the date components in the user's timezone
  let dateInTz: Date;
  if (timezone) {
    const dateStr = checkDate.toLocaleString("en-US", { timeZone: timezone });
    dateInTz = new Date(dateStr);
  } else {
    dateInTz = new Date(checkDate);
  }
  
  const year = dateInTz.getFullYear();
  const month = dateInTz.getMonth() + 1; // 1-12
  const day = dateInTz.getDate();
  const dayOfWeek = dateInTz.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
  
  switch (reminder.frequency) {
    case "daily":
    case "hourly":
    case "minutely":
      // These can occur on any date
      return true;
      
    case "once":
      // Check if the date matches the target date or daysFromNow calculation
      if (reminder.targetDate) {
        const target = new Date(reminder.targetDate);
        let targetInTz: Date;
        if (timezone) {
          const targetStr = target.toLocaleString("en-US", { timeZone: timezone });
          targetInTz = new Date(targetStr);
        } else {
          targetInTz = new Date(target);
        }
        return (
          targetInTz.getFullYear() === year &&
          targetInTz.getMonth() + 1 === month &&
          targetInTz.getDate() === day
        );
      }
      if (reminder.daysFromNow !== null) {
        // Calculate the target date from daysFromNow
        const now = new Date();
        let nowInTz: Date;
        if (timezone) {
          const nowStr = now.toLocaleString("en-US", { timeZone: timezone });
          nowInTz = new Date(nowStr);
        } else {
          nowInTz = new Date(now);
        }
        const targetDate = new Date(nowInTz);
        targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
        return (
          targetDate.getFullYear() === year &&
          targetDate.getMonth() + 1 === month &&
          targetDate.getDate() === day
        );
      }
      return false;
      
    case "weekly":
      // Check if the day of week matches
      if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
        return false;
      }
      return reminder.daysOfWeek.includes(dayOfWeek);
      
    case "monthly":
      // Check if the day of month matches
      const reminderDay = reminder.dayOfMonth ?? 1;
      // Handle edge case where day doesn't exist in month (e.g., Feb 31)
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const targetDay = Math.min(reminderDay, lastDayOfMonth);
      return day === targetDay;
      
    case "yearly":
      // Check if the month and day match
      const reminderMonth = reminder.month ?? 1;
      const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
      // Handle edge case where day doesn't exist in month (e.g., Feb 31)
      const lastDay = new Date(year, month, 0).getDate();
      const targetDayOfMonth = Math.min(reminderDayOfMonth, lastDay);
      return month === reminderMonth && day === targetDayOfMonth;
      
    default:
      return false;
  }
}

/**
 * Check if a reminder can occur on any date within a date range
 */
function canReminderOccurInRange(
  reminder: Reminder,
  startDate: Date,
  endDate: Date,
  timezone?: string
): boolean {
  // Get date components for start and end dates in user's timezone
  let startInTz: Date;
  let endInTz: Date;
  if (timezone) {
    const startStr = startDate.toLocaleString("en-US", { timeZone: timezone });
    const endStr = endDate.toLocaleString("en-US", { timeZone: timezone });
    startInTz = new Date(startStr);
    endInTz = new Date(endStr);
  } else {
    startInTz = new Date(startDate);
    endInTz = new Date(endDate);
  }
  
  const startYear = startInTz.getFullYear();
  const startMonth = startInTz.getMonth() + 1;
  const startDay = startInTz.getDate();
  const endYear = endInTz.getFullYear();
  const endMonth = endInTz.getMonth() + 1;
  const endDay = endInTz.getDate();
  
  switch (reminder.frequency) {
    case "daily":
    case "hourly":
    case "minutely":
      // These can occur on any date
      return true;
      
    case "once":
      // Check if the target date is within the range
      if (reminder.targetDate) {
        const target = new Date(reminder.targetDate);
        let targetInTz: Date;
        if (timezone) {
          const targetStr = target.toLocaleString("en-US", { timeZone: timezone });
          targetInTz = new Date(targetStr);
        } else {
          targetInTz = new Date(target);
        }
        const targetYear = targetInTz.getFullYear();
        const targetMonth = targetInTz.getMonth() + 1;
        const targetDay = targetInTz.getDate();
        
        // Check if target date is within range
        if (targetYear < startYear || targetYear > endYear) return false;
        if (targetYear === startYear && targetMonth < startMonth) return false;
        if (targetYear === startYear && targetMonth === startMonth && targetDay < startDay) return false;
        if (targetYear === endYear && targetMonth > endMonth) return false;
        if (targetYear === endYear && targetMonth === endMonth && targetDay > endDay) return false;
        return true;
      }
      if (reminder.daysFromNow !== null) {
        // Calculate the target date from daysFromNow
        const now = new Date();
        let nowInTz: Date;
        if (timezone) {
          const nowStr = now.toLocaleString("en-US", { timeZone: timezone });
          nowInTz = new Date(nowStr);
        } else {
          nowInTz = new Date(now);
        }
        const targetDate = new Date(nowInTz);
        targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
        targetDate.setHours(0, 0, 0, 0); // Reset to start of day for comparison
        
        // Check if target date is within range
        const startOfDay = new Date(startInTz);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(endInTz);
        endOfDay.setHours(23, 59, 59, 999);
        
        return targetDate >= startOfDay && targetDate <= endOfDay;
      }
      return false;
      
    case "weekly":
      // Check if any day of week in the range matches
      if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
        return false;
      }
      // Iterate through days in range and check if any matches
      const currentDate = new Date(startInTz);
      while (currentDate <= endInTz) {
        const dayOfWeek = currentDate.getDay();
        if (reminder.daysOfWeek.includes(dayOfWeek)) {
          return true;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      return false;
      
    case "monthly":
      // Check if any date in the range matches the day of month
      const reminderDay = reminder.dayOfMonth ?? 1;
      const currentMonthDate = new Date(startInTz);
      while (currentMonthDate <= endInTz) {
        const year = currentMonthDate.getFullYear();
        const month = currentMonthDate.getMonth() + 1;
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const targetDay = Math.min(reminderDay, lastDayOfMonth);
        
        // Check if this month's target day is in range
        const targetDate = new Date(year, month - 1, targetDay);
        if (targetDate >= startInTz && targetDate <= endInTz) {
          return true;
        }
        // Move to next month
        currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
        currentMonthDate.setDate(1);
      }
      return false;
      
    case "yearly":
      // Check if any date in the range matches the month and day
      const reminderMonth = reminder.month ?? 1;
      const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
      
      // Check each year in the range
      for (let year = startYear; year <= endYear; year++) {
        const lastDay = new Date(year, reminderMonth, 0).getDate();
        const targetDay = Math.min(reminderDayOfMonth, lastDay);
        const targetDate = new Date(year, reminderMonth - 1, targetDay);
        
        if (targetDate >= startInTz && targetDate <= endInTz) {
          return true;
        }
      }
      return false;
      
    default:
      return false;
  }
}

// ==================== MAIN COMPONENT ====================

// ==================== USER TIME DISPLAY COMPONENT ====================

function UserTimeDisplay({ timezone }: { timezone: string | null | undefined }) {
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    if (!timezone) {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      return;
    }

    const updateTime = () => {
      const now = new Date();
      // Use toLocaleString to get the time in the user's timezone, then create a Date from it
      const userTimeString = now.toLocaleString("en-US", { timeZone: timezone });
      const userTime = new Date(userTimeString);

      // Extract time components
      const hoursStr = String(userTime.getHours()).padStart(2, '0');
      const minutesStr = String(userTime.getMinutes()).padStart(2, '0');
      const secondsStr = String(userTime.getSeconds()).padStart(2, '0');
      setCurrentTime(`${hoursStr}:${minutesStr}:${secondsStr}`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  if (!timezone) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-lg border">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Your Time</span>
        <span className="text-sm font-mono font-semibold">{currentTime}</span>
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function RemindersPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch user data to get timezone
  const { data: user } = useQuery(trpc.user.me.queryOptions());

  // Fetch reminders from database
  const { data: reminders = [], isLoading, error } = useQuery(
    trpc.reminders.list.queryOptions()
  );

  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reminderToDelete, setReminderToDelete] = useState<string | null>(null);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  
  // Date filter state
  type DateFilterType = "all" | "today" | "tomorrow" | "thisWeek" | "thisMonth" | "custom";
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  
  // Active/Inactive filter state
  type StatusFilterType = "all" | "active" | "inactive";
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>("all");
  
  // Reminder type (frequency) filter state
  type TypeFilterType = "all" | ReminderFrequency;
  const [typeFilter, setTypeFilter] = useState<TypeFilterType>("all");
  
  // Count active filters
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== "all" || customDateRange) count++;
    if (statusFilter !== "all") count++;
    if (typeFilter !== "all") count++;
    return count;
  }, [dateFilter, customDateRange, statusFilter, typeFilter]);

  const initialFormState: ReminderFormData = useMemo(() => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    return {
      id: null,
      title: "",
      frequency: "daily",
      time: "17:00",
      minuteOfHour: 0,
      intervalMinutes: 5,
      daysFromNow: 1,
      targetDate: tomorrow.toISOString().slice(0, 16), // Format for datetime-local input
      dayOfMonth: 1,
      month: 1,
      daysOfWeek: [1], // Default to Monday
      active: true,
    };
  }, []);

  const [form, setForm] = useState<ReminderFormData>(initialFormState);

  // Mutations
  const createMutation = useMutation(
    trpc.reminders.create.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder created successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to create reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const updateMutation = useMutation(
    trpc.reminders.update.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder updated successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to update reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const deleteMutation = useMutation(
    trpc.reminders.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        toast({ title: "Reminder deleted successfully" });
      },
      onError: (error: any) => {
        toast({
          title: "Failed to delete reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  const toggleActiveMutation = useMutation(
    trpc.reminders.toggleActive.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
      },
      onError: (error: any) => {
        toast({
          title: "Failed to toggle reminder",
          description: error?.message || "Please try again",
          variant: "destructive",
        });
      },
    })
  );

  // Filter and sort reminders
  const userTimezone = (user as any)?.timezone;
  
  // Calculate reminders for today and tomorrow
  const remindersWithNext = useMemo(() => {
    const now = new Date();
    return reminders.map((r) => {
      const reminderForCompute: Reminder = {
        ...r,
        time: r.time ?? null,
        minuteOfHour: r.minuteOfHour ?? null,
        intervalMinutes: r.intervalMinutes ?? null,
        daysFromNow: r.daysFromNow ?? null,
        targetDate: r.targetDate ? (r.targetDate instanceof Date ? r.targetDate : new Date(r.targetDate)) : null,
        dayOfMonth: r.dayOfMonth ?? null,
        month: r.month ?? null,
        daysOfWeek: r.daysOfWeek ?? null,
        createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
      };
      return {
        ...r,
        nextAt: computeNext(reminderForCompute, now, userTimezone)
      };
    });
  }, [reminders, userTimezone]);

  // Count reminders for today and tomorrow
  const remindersToday = useMemo(() => {
    const today = startOfDay(new Date());
    const tomorrow = endOfDay(new Date());
    return remindersWithNext.filter((r) => {
      if (!r.nextAt || !r.active) return false;
      return r.nextAt >= today && r.nextAt <= tomorrow;
    }).length;
  }, [remindersWithNext]);

  const remindersTomorrow = useMemo(() => {
    const tomorrowStart = startOfDay(addDays(new Date(), 1));
    const tomorrowEnd = endOfDay(addDays(new Date(), 1));
    return remindersWithNext.filter((r) => {
      if (!r.nextAt || !r.active) return false;
      return r.nextAt >= tomorrowStart && r.nextAt <= tomorrowEnd;
    }).length;
  }, [remindersWithNext]);

  // Count active and paused reminders
  const activeCount = useMemo(() => reminders.filter((r) => r.active).length, [reminders]);
  const pausedCount = useMemo(() => reminders.filter((r) => !r.active).length, [reminders]);

  // Status filter state (All, Active, Paused)
  const [statusTab, setStatusTab] = useState<"all" | "active" | "paused">("all");

  // Sort state
  const [sortBy, setSortBy] = useState<"date" | "alphabetical" | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const now = new Date();
    
    // Calculate date filter range based on filter type
    let dateFilterRange: { start: Date; end: Date } | null = null;
    
    if (dateFilter === "today") {
      dateFilterRange = {
        start: startOfDay(now),
        end: endOfDay(now),
      };
    } else if (dateFilter === "tomorrow") {
      const tomorrow = addDays(now, 1);
      dateFilterRange = {
        start: startOfDay(tomorrow),
        end: endOfDay(tomorrow),
      };
    } else if (dateFilter === "thisWeek") {
      dateFilterRange = {
        start: startOfWeek(now, { weekStartsOn: 0 }), // Sunday
        end: endOfWeek(now, { weekStartsOn: 0 }),
      };
    } else if (dateFilter === "thisMonth") {
      dateFilterRange = {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    } else if (dateFilter === "custom" && customDateRange?.from && customDateRange?.to) {
      dateFilterRange = {
        start: startOfDay(customDateRange.from),
        end: endOfDay(customDateRange.to),
      };
    }
    
    return reminders
      .map((r) => {
        // Prepare reminder object for compute function
        const reminderForCompute: Reminder = {
          ...r,
          time: r.time ?? null,
          minuteOfHour: r.minuteOfHour ?? null,
          intervalMinutes: r.intervalMinutes ?? null,
          daysFromNow: r.daysFromNow ?? null,
          targetDate: r.targetDate ? (r.targetDate instanceof Date ? r.targetDate : new Date(r.targetDate)) : null,
          dayOfMonth: r.dayOfMonth ?? null,
          month: r.month ?? null,
          daysOfWeek: r.daysOfWeek ?? null,
          createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
        };
        return {
          ...r,
          nextAt: computeNext(reminderForCompute, new Date(), userTimezone)
        };
      })
      .filter((r) => {
        // Text search filter
        if (q && !r.title.toLowerCase().includes(q)) {
          return false;
        }
        
        // Status filter (active/inactive) - use statusTab for the new UI
        if (statusTab !== "all") {
          if (statusTab === "active" && !r.active) {
            return false;
          }
          if (statusTab === "paused" && r.active) {
            return false;
          }
        }
        
        // Reminder type (frequency) filter
        if (typeFilter !== "all" && r.frequency !== typeFilter) {
          return false;
        }
        
        // Date filter - check if reminder can occur on any date in the range
        if (dateFilter !== "all" && dateFilterRange) {
          // Prepare reminder object for checking
          const reminderForCheck: Reminder = {
            ...r,
            time: r.time ?? null,
            minuteOfHour: r.minuteOfHour ?? null,
            intervalMinutes: r.intervalMinutes ?? null,
            daysFromNow: r.daysFromNow ?? null,
            targetDate: r.targetDate ? (r.targetDate instanceof Date ? r.targetDate : new Date(r.targetDate)) : null,
            dayOfMonth: r.dayOfMonth ?? null,
            month: r.month ?? null,
            daysOfWeek: r.daysOfWeek ?? null,
            createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
            updatedAt: r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt),
          };
          
          // Check if the reminder can occur on any date within the range
          return canReminderOccurInRange(
            reminderForCheck,
            dateFilterRange.start,
            dateFilterRange.end,
            userTimezone
          );
        }
        
        return true;
      })
      .sort((a, b) => {
        // Active reminders first, sorted by next occurrence
        if (a.active && b.active) {
          const aTime = a.nextAt?.getTime() || Infinity;
          const bTime = b.nextAt?.getTime() || Infinity;
          return aTime - bTime;
        }
        if (a.active) return -1;
        if (b.active) return 1;
        // Inactive sorted by creation date (newest first)
        const aCreatedAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bCreatedAt = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bCreatedAt.getTime() - aCreatedAt.getTime();
      })
      .sort((a, b) => {
        // Apply sort if specified
        if (sortBy && sortOrder) {
          if (sortBy === "alphabetical") {
            const comparison = a.title.localeCompare(b.title);
            return sortOrder === "asc" ? comparison : -comparison;
          } else if (sortBy === "date") {
            const aTime = a.nextAt?.getTime() || (a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime());
            const bTime = b.nextAt?.getTime() || (b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime());
            return sortOrder === "asc" ? aTime - bTime : bTime - aTime;
          }
        }
        // Default: Active reminders first, sorted by next occurrence
        if (a.active && b.active) {
          const aTime = a.nextAt?.getTime() || Infinity;
          const bTime = b.nextAt?.getTime() || Infinity;
          return aTime - bTime;
        }
        if (a.active) return -1;
        if (b.active) return 1;
        // Inactive sorted by creation date (newest first)
        const aCreatedAt = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bCreatedAt = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bCreatedAt.getTime() - aCreatedAt.getTime();
      });
  }, [reminders, query, userTimezone, dateFilter, customDateRange, statusTab, typeFilter, sortBy, sortOrder]);

  const resetForm = useCallback(() => {
    setForm(initialFormState);
  }, [initialFormState]);

  const openNewForm = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ESC to close modal
      if (e.key === "Escape" && showForm) {
        setShowForm(false);
        resetForm();
      }
      // Ctrl/Cmd + K to open new reminder form
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && !showForm) {
        e.preventDefault();
        openNewForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showForm, resetForm, openNewForm]);

  const openEditForm = useCallback((reminder: Reminder) => {
    const targetDateValue = reminder.targetDate
      ? (reminder.targetDate instanceof Date
        ? reminder.targetDate
        : new Date(reminder.targetDate)
      ).toISOString().slice(0, 16)
      : initialFormState.targetDate;

    setForm({
      id: reminder.id,
      title: reminder.title,
      frequency: reminder.frequency,
      time: reminder.time || "17:00",
      minuteOfHour: reminder.minuteOfHour || 0,
      intervalMinutes: reminder.intervalMinutes || 5,
      daysFromNow: reminder.daysFromNow ?? 1,
      targetDate: targetDateValue,
      dayOfMonth: reminder.dayOfMonth ?? 1,
      month: reminder.month ?? 1,
      daysOfWeek: reminder.daysOfWeek && reminder.daysOfWeek.length > 0 ? reminder.daysOfWeek : [1],
      active: reminder.active,
    });
    setShowForm(true);
  }, [initialFormState]);

  const validateForm = (): string | null => {
    if (!form.title.trim()) {
      return "Please enter a title for your reminder";
    }
    if (form.title.trim().length > 100) {
      return "Title must be 100 characters or less";
    }
    if (form.frequency === "hourly" && (form.minuteOfHour < 0 || form.minuteOfHour > 59)) {
      return "Minute of hour must be between 0 and 59";
    }
    if (form.frequency === "minutely" && (form.intervalMinutes < 1 || form.intervalMinutes > 720)) {
      return "Interval must be between 1 and 720 minutes";
    }
    if (form.frequency === "once") {
      const hasTargetDate = form.targetDate && form.targetDate.trim() !== "";
      const hasDaysFromNow = form.daysFromNow !== undefined && form.daysFromNow >= 0;
      if (!hasTargetDate && !hasDaysFromNow) {
        return "Please specify either days from now or a target date";
      }
    }
    if (form.frequency === "weekly") {
      if (!form.daysOfWeek || form.daysOfWeek.length === 0) {
        return "Please select at least one day of the week";
      }
      if (!form.time || form.time.trim() === "") {
        return "Please specify a time for the weekly reminder";
      }
    }
    if (form.frequency === "monthly" && (form.dayOfMonth < 1 || form.dayOfMonth > 31)) {
      return "Day of month must be between 1 and 31";
    }
    if (form.frequency === "yearly") {
      if (form.month < 1 || form.month > 12) {
        return "Month must be between 1 and 12";
      }
      if (form.dayOfMonth < 1 || form.dayOfMonth > 31) {
        return "Day of month must be between 1 and 31";
      }
    }
    return null;
  };

  const saveForm = useCallback(async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    // Build payload with all schedule fields nulled by default to avoid stale data when editing
    const payload: any = {
      title: form.title,
      frequency: form.frequency,
      active: form.active,
      time: null,
      minuteOfHour: null,
      intervalMinutes: null,
      daysFromNow: null,
      targetDate: null,
      dayOfMonth: null,
      month: null,
      daysOfWeek: null,
    };

    // Add frequency-specific fields
    if (form.frequency === "daily") {
      payload.time = form.time;
    } else if (form.frequency === "hourly") {
      payload.minuteOfHour = form.minuteOfHour;
    } else if (form.frequency === "minutely") {
      payload.intervalMinutes = form.intervalMinutes;
    } else if (form.frequency === "once") {
      if (form.targetDate && form.targetDate.trim() !== "") {
        payload.targetDate = new Date(form.targetDate);
      } else {
        payload.daysFromNow = form.daysFromNow;
      }
    } else if (form.frequency === "weekly") {
      payload.daysOfWeek = form.daysOfWeek;
      payload.time = form.time;
    } else if (form.frequency === "monthly") {
      payload.dayOfMonth = form.dayOfMonth;
      if (form.time) payload.time = form.time;
    } else if (form.frequency === "yearly") {
      payload.month = form.month;
      payload.dayOfMonth = form.dayOfMonth;
      if (form.time) payload.time = form.time;
    }

    try {
      if (form.id) {
        // Update existing reminder
        await updateMutation.mutateAsync({ id: form.id, ...payload });
      } else {
        // Create new reminder
        await createMutation.mutateAsync(payload);
      }

      setShowForm(false);
      resetForm();
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [form, toast, resetForm, createMutation, updateMutation]);

  const confirmDelete = useCallback((id: string) => {
    setReminderToDelete(id);
    setDeleteDialogOpen(true);
  }, []);

  const removeReminder = useCallback(async () => {
    if (!reminderToDelete) return;

    try {
      await deleteMutation.mutateAsync({ id: reminderToDelete });
      setDeleteDialogOpen(false);
      setReminderToDelete(null);
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [reminderToDelete, deleteMutation]);

  const toggleActive = useCallback(async (id: string) => {
    const reminder = reminders.find((r) => r.id === id);
    if (!reminder) return;

    const newActive = !reminder.active;
    try {
      await toggleActiveMutation.mutateAsync({ id, active: newActive });
      toast({
        title: newActive ? "Reminder Activated" : "Reminder Paused",
        description: `"${reminder.title}" is now ${newActive ? "active" : "paused"}.`,
      });
    } catch (error) {
      // Error handling is done in the mutation
    }
  }, [reminders, toast, toggleActiveMutation]);

  // Helper function to format frequency description for display
  const getFrequencyText = (reminder: any) => {
    if (reminder.frequency === "daily") return "Daily";
    if (reminder.frequency === "weekly") {
      if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
        const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        if (reminder.daysOfWeek.length === 1) {
          return `Every ${dayNames[reminder.daysOfWeek[0]]}`;
        }
        return "Weekly";
      }
      return "Weekly";
    }
    if (reminder.frequency === "monthly") return "Monthly";
    if (reminder.frequency === "yearly") return "Yearly";
    if (reminder.frequency === "hourly") return "Hourly";
    if (reminder.frequency === "minutely") return "Every N minutes";
    if (reminder.frequency === "once") return "Once";
    return "Reminder";
  };

  // Helper function to format time
  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "08:00 PM";
    const [hours, minutes] = timeStr.split(":");
    const hour = parseInt(hours || "20", 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes || "00"} ${ampm}`;
  };

  // Helper function to calculate time until next occurrence
  const getTimeUntilNext = (reminder: any) => {
    if (!reminder.nextAt || !reminder.active) return null;
    const now = new Date();
    const next = reminder.nextAt instanceof Date ? reminder.nextAt : new Date(reminder.nextAt);
    const diffMs = next.getTime() - now.getTime();
    
    if (diffMs < 0) return null;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""} ${minutes} min${minutes !== 1 ? "s" : ""}`;
    }
    return `${minutes} min${minutes !== 1 ? "s" : ""}`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Main Container */}
      <div className="mx-auto max-w-md md:max-w-4xl lg:max-w-6xl">
        {/* Search and Sort Bar */}
        <div className="p-4 bg-white border-b border-[#E6E8EC]">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9B9BA7] pointer-events-none" size={18} />
              <Input
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                placeholder="Search reminders..."
                className="w-full h-10 sm:h-11 bg-gray-50 border border-gray-200 rounded-lg pr-10 pl-4 text-sm"
              />
            </div>
            <Select
              value={sortBy && sortOrder ? `${sortBy}-${sortOrder}` : undefined}
              onValueChange={(value) => {
                const [by, order] = value.split("-") as ["date" | "alphabetical", "asc" | "desc"];
                setSortBy(by);
                setSortOrder(order);
              }}
            >
              <SelectTrigger className="w-[140px] h-10 sm:h-11 bg-gray-50 border border-gray-200">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (Newest)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                <SelectItem value="alphabetical-asc">A-Z</SelectItem>
                <SelectItem value="alphabetical-desc">Z-A</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Heading */}
        <div className="px-4 pt-6 pb-4">
          <h1 className="text-[20px] font-semibold leading-[130%] text-[#141718]">Reminders</h1>
        </div>
      <AlertDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <AlertDialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Filter size={20} />
              Filter Reminders
            </AlertDialogTitle>
          </AlertDialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Date Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <CalendarIcon size={16} />
                Date Filter
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "today", "tomorrow", "thisWeek", "thisMonth"] as DateFilterType[]).map((filter) => {
                  const isActive = dateFilter === filter;
                  const labels: Record<DateFilterType, string> = {
                    all: "All",
                    today: "Today",
                    tomorrow: "Tomorrow",
                    thisWeek: "This Week",
                    thisMonth: "This Month",
                    custom: "Custom",
                  };
                  
                  return (
                    <Button
                      key={filter}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setDateFilter(filter);
                        if (filter !== "custom") {
                          setCustomDateRange(undefined);
                        }
                      }}
                      className="h-9"
                    >
                      {labels[filter]}
                    </Button>
                  );
                })}
                
                {/* Custom date range picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant={dateFilter === "custom" ? "default" : "outline"}
                      size="sm"
                      className="h-9"
                    >
                      <CalendarIcon size={14} className="mr-1.5" />
                      Custom Range
                      {customDateRange?.from && customDateRange?.to && (
                        <span className="ml-1.5 text-xs opacity-70">
                          ({format(customDateRange.from, "MMM d")} - {format(customDateRange.to, "MMM d")})
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={customDateRange?.from}
                      selected={customDateRange}
                      onSelect={(range: DateRange | undefined) => {
                        if (range?.from && range?.to) {
                          setCustomDateRange(range);
                          setDateFilter("custom");
                        } else if (range?.from) {
                          setCustomDateRange({ from: range.from, to: undefined });
                          setDateFilter("custom");
                        } else {
                          setCustomDateRange(undefined);
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Status Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <BellRing size={16} />
                Status Filter
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "active", "inactive"] as StatusFilterType[]).map((filter) => {
                  const isActive = statusFilter === filter;
                  const labels: Record<StatusFilterType, string> = {
                    all: "All",
                    active: "Active",
                    inactive: "Paused",
                  };
                  
                  return (
                    <Button
                      key={filter}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatusFilter(filter)}
                      className="h-9"
                    >
                      {labels[filter]}
                    </Button>
                  );
                })}
              </div>
            </div>
            
            {/* Reminder Type Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <AlarmClock size={16} />
                Reminder Type
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={typeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                  className="h-9"
                >
                  All
                </Button>
                {(["daily", "hourly", "minutely", "once", "weekly", "monthly", "yearly"] as ReminderFrequency[]).map((frequency) => {
                  const isActive = typeFilter === frequency;
                  const labels: Record<ReminderFrequency, string> = {
                    daily: "Daily",
                    hourly: "Hourly",
                    minutely: "Minutely",
                    once: "Once",
                    weekly: "Weekly",
                    monthly: "Monthly",
                    yearly: "Yearly",
                  };
                  
                  return (
                    <Button
                      key={frequency}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTypeFilter(frequency)}
                      className="h-9"
                    >
                      {labels[frequency]}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          
          <AlertDialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDateFilter("all");
                setStatusFilter("all");
                setTypeFilter("all");
                setCustomDateRange(undefined);
              }}
              className="flex-1 sm:flex-none"
            >
              <X size={16} className="mr-2" />
              Clear All
            </Button>
            <AlertDialogAction
              onClick={() => setFilterDialogOpen(false)}
              className="flex-1 sm:flex-none"
            >
              Apply Filters
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        {/* Summary Cards */}
        <div className="px-4 pb-4">
          <div className="flex gap-2">
            <div className="flex-1 relative p-4 rounded-xl border bg-white shadow-[0_2px_16px_0_rgba(0,0,0,0.02)] overflow-hidden" style={{ borderColor: "#ECF7FC" }}>
              <div className="absolute top-0 left-0 w-[55px] h-[55px] rounded-full" style={{ background: "#C5EEFF", filter: 'blur(50px)' }} />
              <div className="relative flex items-start gap-2">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="text-[32px] font-medium leading-none tracking-[-1.28px] text-black">
                    {remindersToday}
                  </div>
                  <div className="text-[12px] font-normal tracking-[-0.48px] text-[#4C4C4C]">
                    Reminders Today
                  </div>
                </div>
                <div className="w-8 h-8 flex items-center justify-center rounded-[19px]" style={{ background: "#F2FBFF" }}>
                  <BellRing size={16} style={{ color: "#48BBED" }} />
                </div>
              </div>
            </div>
            <div className="flex-1 relative p-4 rounded-xl border bg-white shadow-[0_2px_16px_0_rgba(0,0,0,0.02)] overflow-hidden" style={{ borderColor: "#FCF8EC" }}>
              <div className="absolute top-0 left-0 w-[55px] h-[55px] rounded-full" style={{ background: "#FFF0C5", filter: 'blur(50px)' }} />
              <div className="relative flex items-start gap-2">
                <div className="flex-1 flex flex-col gap-2">
                  <div className="text-[32px] font-medium leading-none tracking-[-1.28px] text-black">
                    {remindersTomorrow}
                  </div>
                  <div className="text-[12px] font-normal tracking-[-0.48px] text-[#4C4C4C]">
                    Reminders Tomorrow
                  </div>
                </div>
                <div className="w-8 h-8 flex items-center justify-center rounded-[19px]" style={{ background: "#FFFCF2" }}>
                  <CalendarIcon size={16} style={{ color: "#E1B739" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStatusTab("all")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusTab === "all"
                  ? "bg-black text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusTab("active")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusTab === "active"
                  ? "bg-black text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Active
              {statusTab !== "active" && (
                <span className="ml-2" style={{ color: "#9B9BA7" }}>({activeCount})</span>
              )}
            </button>
            <button
              onClick={() => setStatusTab("paused")}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                statusTab === "paused"
                  ? "bg-black text-white"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Paused
              {statusTab !== "paused" && (
                <span className="ml-2" style={{ color: "#9B9BA7" }}>({pausedCount})</span>
              )}
            </button>
          </div>
        </div>

        {/* Reminders List */}
        <div className="px-4 pb-20">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <BellRing className="h-12 w-12 mx-auto mb-4 text-gray-400 opacity-50" />
              <p className="text-sm text-gray-500">
                {query ? `No reminders found matching "${query}"` : "No reminders found. Create your first reminder!"}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {filtered.map((r, index) => {
                const timeUntilNext = getTimeUntilNext(r);
                const frequencyText = getFrequencyText(r);
                const timeText = formatTime(r.time);
                
                return (
                  <React.Fragment key={r.id}>
                    <div className="flex items-center justify-between py-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-semibold leading-[130%] text-[#1D1D1B] mb-1">
                          {r.title}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-medium text-[#EEB183]">
                            • {frequencyText}
                          </span>
                          <div className="flex items-center gap-1">
                            <Clock size={14} style={{ color: "#6D6DE2" }} />
                            <span className="text-[12px] font-medium text-[#6D6DE2]">
                              {timeText}
                            </span>
                          </div>
                          {timeUntilNext && (
                            <>
                              <span className="text-[12px] text-[#A9A9A9]">•</span>
                              <span className="text-[12px] font-medium text-[#9999A5]">
                                {timeUntilNext}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <Switch
                          checked={r.active}
                          onCheckedChange={() => toggleActive(r.id)}
                          aria-label={`Toggle ${r.title}`}
                          className={r.active ? "data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600" : "data-[state=unchecked]:bg-gray-300"}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="text-[#9B9BA7] hover:text-gray-700">
                              <MoreVertical size={20} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-lg shadow-lg border border-gray-200 bg-white p-1 min-w-[160px]">
                            <DropdownMenuItem
                              onClick={() => openEditForm(r)}
                              className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5"
                            >
                              <Pencil size={14} className="mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => confirmDelete(r.id)}
                              className="flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 text-red-600 focus:text-red-600"
                            >
                              <Trash2 size={14} className="mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    {index < filtered.length - 1 && (
                      <div className="w-[90%] mx-auto h-px bg-gray-100" />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Action Button */}
        <button
          onClick={openNewForm}
          className="fixed bottom-6 left-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg flex items-center justify-center transition-colors z-50 lg:hidden"
        >
          <Plus className="h-6 w-6 text-white" />
        </button>
      </div>

      {/* Filter Modal */}
      <AlertDialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <AlertDialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Filter size={20} />
              Filter Reminders
            </AlertDialogTitle>
          </AlertDialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Date Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <CalendarIcon size={16} />
                Date Filter
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "today", "tomorrow", "thisWeek", "thisMonth"] as DateFilterType[]).map((filter) => {
                  const isActive = dateFilter === filter;
                  const labels: Record<DateFilterType, string> = {
                    all: "All",
                    today: "Today",
                    tomorrow: "Tomorrow",
                    thisWeek: "This Week",
                    thisMonth: "This Month",
                    custom: "Custom",
                  };
                  
                  return (
                    <Button
                      key={filter}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setDateFilter(filter);
                        if (filter !== "custom") {
                          setCustomDateRange(undefined);
                        }
                      }}
                      className="h-9"
                    >
                      {labels[filter]}
                    </Button>
                  );
                })}
                
                {/* Custom date range picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant={dateFilter === "custom" ? "default" : "outline"}
                      size="sm"
                      className="h-9"
                    >
                      <CalendarIcon size={14} className="mr-1.5" />
                      Custom Range
                      {customDateRange?.from && customDateRange?.to && (
                        <span className="ml-1.5 text-xs opacity-70">
                          ({format(customDateRange.from, "MMM d")} - {format(customDateRange.to, "MMM d")})
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={customDateRange?.from}
                      selected={customDateRange}
                      onSelect={(range: DateRange | undefined) => {
                        if (range?.from && range?.to) {
                          setCustomDateRange(range);
                          setDateFilter("custom");
                        } else if (range?.from) {
                          setCustomDateRange({ from: range.from, to: undefined });
                          setDateFilter("custom");
                        } else {
                          setCustomDateRange(undefined);
                        }
                      }}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Status Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <BellRing size={16} />
                Status Filter
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "active", "inactive"] as StatusFilterType[]).map((filter) => {
                  const isActive = statusFilter === filter;
                  const labels: Record<StatusFilterType, string> = {
                    all: "All",
                    active: "Active",
                    inactive: "Paused",
                  };
                  
                  return (
                    <Button
                      key={filter}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setStatusFilter(filter)}
                      className="h-9"
                    >
                      {labels[filter]}
                    </Button>
                  );
                })}
              </div>
            </div>
            
            {/* Reminder Type Filter Section */}
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <AlarmClock size={16} />
                Reminder Type
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={typeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                  className="h-9"
                >
                  All
                </Button>
                {(["daily", "hourly", "minutely", "once", "weekly", "monthly", "yearly"] as ReminderFrequency[]).map((frequency) => {
                  const isActive = typeFilter === frequency;
                  const labels: Record<ReminderFrequency, string> = {
                    daily: "Daily",
                    hourly: "Hourly",
                    minutely: "Minutely",
                    once: "Once",
                    weekly: "Weekly",
                    monthly: "Monthly",
                    yearly: "Yearly",
                  };
                  
                  return (
                    <Button
                      key={frequency}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTypeFilter(frequency)}
                      className="h-9"
                    >
                      {labels[frequency]}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          
          <AlertDialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDateFilter("all");
                setStatusFilter("all");
                setTypeFilter("all");
                setCustomDateRange(undefined);
              }}
              className="flex-1 sm:flex-none"
            >
              <X size={16} className="mr-2" />
              Clear All
            </Button>
            <AlertDialogAction
              onClick={() => setFilterDialogOpen(false)}
              className="flex-1 sm:flex-none"
            >
              Apply Filters
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Form Modal */}
      <AlertDialog
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            resetForm();
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-3 pb-4 border-b">
            <AlertDialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center ${form.id ? "bg-indigo-100" : "bg-blue-100"
                  }`}
              >
                {form.id ? (
                  <Pencil className="h-5 w-5 text-indigo-600" />
                ) : (
                  <Plus className="h-5 w-5 text-blue-600" />
                )}
              </div>
              {form.id ? "Edit Reminder" : "Add New Reminder"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              {form.id
                ? "Update your reminder settings"
                : "Create a new recurring reminder"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form onSubmit={(e: React.FormEvent) => { e.preventDefault(); saveForm(); }} className="space-y-6 pt-2">
            {/* Title */}
            <div className="space-y-2">
              <Label
                htmlFor="title"
                className="text-sm font-semibold text-gray-700 flex items-center gap-1"
              >
                Title
                <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                placeholder="e.g., Daily standup meeting"
                value={form.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, title: e.target.value })
                }
                className="w-full h-11 text-base"
                autoFocus
                required
                maxLength={100}
              />
              <p className="text-xs text-gray-500">
                {form.title.length}/100 characters
              </p>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency" className="text-sm font-semibold text-gray-700">
                Frequency
              </Label>
              <Select
                value={form.frequency}
                onValueChange={(v: string) => {
                  const newFrequency = v as ReminderFrequency;
                  // Initialize daysOfWeek when switching to weekly
                  if (newFrequency === "weekly") {
                    const currentDays = form.daysOfWeek || [];
                    if (currentDays.length === 0) {
                      setForm({ ...form, frequency: newFrequency, daysOfWeek: [1] }); // Default to Monday
                    } else {
                      setForm({ ...form, frequency: newFrequency });
                    }
                  } else {
                    setForm({ ...form, frequency: newFrequency });
                  }
                }}
              >
                <SelectTrigger className="h-11" id="frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px] z-50">
                  <SelectItem value="daily">Every day</SelectItem>
                  <SelectItem value="hourly">Every hour</SelectItem>
                  <SelectItem value="minutely">Every N minutes</SelectItem>
                  <SelectItem value="once">One-time reminder</SelectItem>
                  <SelectItem value="weekly">Weekly (specific days)</SelectItem>
                  <SelectItem value="monthly">Monthly (specific date)</SelectItem>
                  <SelectItem value="yearly">Yearly (specific date)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Daily - Time */}
            {form.frequency === "daily" && (
              <div className="space-y-2">
                <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                  Time
                </Label>
                <Input
                  id="time"
                  type="time"
                  value={form.time}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, time: e.target.value })
                  }
                  className="h-11"
                />
              </div>
            )}

            {/* Hourly - Minute */}
            {form.frequency === "hourly" && (
              <div className="space-y-2">
                <Label htmlFor="minuteOfHour" className="text-sm font-semibold text-gray-700">
                  Minute of each hour
                </Label>
                <Input
                  id="minuteOfHour"
                  type="number"
                  min={0}
                  max={59}
                  value={form.minuteOfHour}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, minuteOfHour: Number(e.target.value) })
                  }
                  className="h-11"
                />
                <p className="text-xs text-gray-500">
                  Reminder will trigger at :{pad(form.minuteOfHour)} of every hour
                </p>
              </div>
            )}

            {/* Minutely - Interval */}
            {form.frequency === "minutely" && (
              <div className="space-y-2">
                <Label htmlFor="intervalMinutes" className="text-sm font-semibold text-gray-700">
                  Interval (minutes)
                </Label>
                <Input
                  id="intervalMinutes"
                  type="number"
                  min={1}
                  max={720}
                  value={form.intervalMinutes}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setForm({ ...form, intervalMinutes: Number(e.target.value) })
                  }
                  className="h-11"
                />
                <p className="text-xs text-gray-500">
                  Reminder will trigger every {form.intervalMinutes} minute
                  {form.intervalMinutes > 1 ? "s" : ""}
                </p>
              </div>
            )}

            {/* Once - Days from now or Target Date */}
            {form.frequency === "once" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700">
                    Reminder Type
                  </Label>
                  <Select
                    value={form.targetDate ? "date" : "days"}
                    onValueChange={(v: string) => {
                      if (v === "date") {
                        const now = new Date();
                        now.setHours(9, 0, 0, 0);
                        setForm({ ...form, targetDate: now.toISOString().slice(0, 16), daysFromNow: 0 });
                      } else {
                        setForm({ ...form, targetDate: "", daysFromNow: 1 });
                      }
                    }}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">In X days from now</SelectItem>
                      <SelectItem value="date">On a specific date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.targetDate ? (
                  <div className="space-y-2">
                    <Label htmlFor="targetDate" className="text-sm font-semibold text-gray-700">
                      Date & Time
                    </Label>
                    <Input
                      id="targetDate"
                      type="datetime-local"
                      value={form.targetDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, targetDate: e.target.value })
                      }
                      className="h-11"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <p className="text-xs text-gray-500">
                      Reminder will trigger on this specific date and time
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="daysFromNow" className="text-sm font-semibold text-gray-700">
                      Days from now
                    </Label>
                    <Input
                      id="daysFromNow"
                      type="number"
                      min={0}
                      max={3650}
                      value={form.daysFromNow}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, daysFromNow: Number(e.target.value) })
                      }
                      className="h-11"
                    />
                    <p className="text-xs text-gray-500">
                      Reminder will trigger in {form.daysFromNow} day{form.daysFromNow !== 1 ? "s" : ""} from now
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Weekly - Days of week and time */}
            {form.frequency === "weekly" && (
              <div className="space-y-4 p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span>Days of the week</span>
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-7 gap-2">
                    {[
                      { value: 0, label: "Sun" },
                      { value: 1, label: "Mon" },
                      { value: 2, label: "Tue" },
                      { value: 3, label: "Wed" },
                      { value: 4, label: "Thu" },
                      { value: 5, label: "Fri" },
                      { value: 6, label: "Sat" },
                    ].map((day) => {
                      const daysOfWeek = form.daysOfWeek || [];
                      const isSelected = daysOfWeek.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => {
                            const currentDays = form.daysOfWeek || [];
                            if (isSelected) {
                              const newDays = currentDays.filter((d) => d !== day.value);
                              setForm({
                                ...form,
                                daysOfWeek: newDays.length > 0 ? newDays : [day.value], // Prevent removing all days
                              });
                            } else {
                              setForm({
                                ...form,
                                daysOfWeek: [...currentDays, day.value].sort((a, b) => a - b),
                              });
                            }
                          }}
                          className={`
                            h-12 w-full rounded-lg border-2 transition-all font-semibold text-sm
                            flex items-center justify-center
                            ${isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                              : "bg-white border-gray-300 hover:border-primary hover:bg-blue-50 text-gray-700 hover:scale-105"
                            }
                          `}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-gray-500">
                    {(!form.daysOfWeek || form.daysOfWeek.length === 0)
                      ? "Select at least one day"
                      : `Selected: ${form.daysOfWeek
                        .sort((a, b) => a - b)
                        .map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d])
                        .join(", ")}`}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                    Time
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, time: e.target.value })
                    }
                    className="h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Reminder will trigger at this time on the selected days
                  </p>
                </div>
              </div>
            )}

            {/* Monthly - Day of month */}
            {form.frequency === "monthly" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth" className="text-sm font-semibold text-gray-700">
                    Day of month
                  </Label>
                  <Input
                    id="dayOfMonth"
                    type="number"
                    min={1}
                    max={31}
                    value={form.dayOfMonth}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, dayOfMonth: Number(e.target.value) })
                    }
                    className="h-11"
                  />
                  <p className="text-xs text-gray-500">
                    Reminder will trigger on the {form.dayOfMonth}
                    {form.dayOfMonth === 1 ? "st" : form.dayOfMonth === 2 ? "nd" : form.dayOfMonth === 3 ? "rd" : "th"} of every month
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                    Time (optional)
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, time: e.target.value })
                    }
                    className="h-11"
                  />
                </div>
              </div>
            )}

            {/* Yearly - Month and Day */}
            {form.frequency === "yearly" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="month" className="text-sm font-semibold text-gray-700">
                      Month
                    </Label>
                    <Select
                      value={form.month.toString()}
                      onValueChange={(v: string) =>
                        setForm({ ...form, month: Number(v) })
                      }
                    >
                      <SelectTrigger className="h-11" id="month">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">January</SelectItem>
                        <SelectItem value="2">February</SelectItem>
                        <SelectItem value="3">March</SelectItem>
                        <SelectItem value="4">April</SelectItem>
                        <SelectItem value="5">May</SelectItem>
                        <SelectItem value="6">June</SelectItem>
                        <SelectItem value="7">July</SelectItem>
                        <SelectItem value="8">August</SelectItem>
                        <SelectItem value="9">September</SelectItem>
                        <SelectItem value="10">October</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">December</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dayOfMonth" className="text-sm font-semibold text-gray-700">
                      Day
                    </Label>
                    <Input
                      id="dayOfMonth"
                      type="number"
                      min={1}
                      max={31}
                      value={form.dayOfMonth}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setForm({ ...form, dayOfMonth: Number(e.target.value) })
                      }
                      className="h-11"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time" className="text-sm font-semibold text-gray-700">
                    Time (optional)
                  </Label>
                  <Input
                    id="time"
                    type="time"
                    value={form.time}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setForm({ ...form, time: e.target.value })
                    }
                    className="h-11"
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Reminder will trigger every year on{" "}
                  {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][form.month - 1]} {form.dayOfMonth}
                  {form.dayOfMonth === 1 ? "st" : form.dayOfMonth === 2 ? "nd" : form.dayOfMonth === 3 ? "rd" : "th"}
                </p>
              </div>
            )}

            {/* Active Toggle */}
            <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
              <span className="text-sm font-medium text-gray-700">
                Start reminder immediately
              </span>
              <Switch
                checked={form.active}
                onCheckedChange={(v: boolean) => setForm({ ...form, active: v })}
                aria-label="Active status"
              />
            </div>

            {/* Footer Buttons */}
            <AlertDialogFooter className="gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="flex-1 sm:flex-none h-11"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="default"
                className="flex-1 sm:flex-none h-11 min-w-[140px]"
              >
                {form.id ? "Update Reminder" : "Add Reminder"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle className="text-xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              Delete Reminder
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-base pt-2">
              <p className="text-gray-700">
                Are you sure you want to delete the reminder
                {reminderToDelete && (() => {
                  const reminder = reminders.find((r) => r.id === reminderToDelete);
                  return reminder ? ` "${reminder.title}"` : "";
                })()}
                ?
              </p>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900 font-medium">
                  ⚠️ This action cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-3 pt-4">
            <AlertDialogCancel
              onClick={() => setReminderToDelete(null)}
              className="flex-1 sm:flex-none h-11"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={removeReminder}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600 flex-1 sm:flex-none h-11 min-w-[140px]"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Reminder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
