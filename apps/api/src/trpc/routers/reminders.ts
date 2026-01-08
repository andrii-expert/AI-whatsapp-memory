import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  createReminder,
  getRemindersByUserId,
  getReminderById,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Middleware to check if user has reminders access - REMOVED LIMITATION
// All users now have access to reminders
const remindersAccessProcedure = protectedProcedure;

// Reminder schemas
const frequencyEnum = z.enum(["daily", "hourly", "minutely", "once", "weekly", "monthly", "yearly"]);

const createReminderSchema = z.object({
  title: z.string().min(1, "Reminder title is required").max(200),
  frequency: frequencyEnum,
  time: z.string().nullish().transform((val) => val ?? undefined),
  minuteOfHour: z.number().min(0).max(59).nullish().transform((val) => val ?? undefined),
  intervalMinutes: z.number().min(1).max(1440).nullish().transform((val) => val ?? undefined),
  daysFromNow: z.number().min(0).max(3650).nullish().transform((val) => val ?? undefined), // Max 10 years
  targetDate: z.union([z.date(), z.string()]).nullish().transform((val) => {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    return new Date(val);
  }),
  dayOfMonth: z.number().min(1).max(31).nullish().transform((val) => val ?? undefined),
  month: z.number().min(1).max(12).nullish().transform((val) => val ?? undefined),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1, "At least one day of week must be selected").nullish().transform((val) => val ?? undefined),
  active: z.boolean().optional(),
}).refine((data) => {
  // Validation based on frequency type
  // Note: refine runs before transform, so we need to check for both null and undefined
  if (data.frequency === "daily" && (data.time === null || data.time === undefined || !data.time)) {
    return false;
  }
  if (data.frequency === "hourly" && (data.minuteOfHour === null || data.minuteOfHour === undefined)) {
    return false;
  }
  if (data.frequency === "minutely" && (data.intervalMinutes === null || data.intervalMinutes === undefined || !data.intervalMinutes)) {
    return false;
  }
  if (data.frequency === "once" && (data.daysFromNow === null || data.daysFromNow === undefined) && (data.targetDate === null || data.targetDate === undefined || !data.targetDate)) {
    return false;
  }
  if (data.frequency === "weekly") {
    if (data.daysOfWeek === null || data.daysOfWeek === undefined || data.daysOfWeek.length === 0) {
      return false;
    }
    if (data.time === null || data.time === undefined || !data.time) {
      return false;
    }
  }
  if (data.frequency === "monthly" && (data.dayOfMonth === null || data.dayOfMonth === undefined || !data.dayOfMonth)) {
    return false;
  }
  if (data.frequency === "yearly" && ((data.month === null || data.month === undefined || !data.month) || (data.dayOfMonth === null || data.dayOfMonth === undefined || !data.dayOfMonth))) {
    return false;
  }
  return true;
}, {
  message: "Invalid reminder configuration for selected frequency",
});

const updateReminderSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  frequency: frequencyEnum.optional(),
  time: z.string().nullish().transform((val) => val ?? undefined),
  minuteOfHour: z.number().min(0).max(59).nullish().transform((val) => val ?? undefined),
  intervalMinutes: z.number().min(1).max(1440).nullish().transform((val) => val ?? undefined),
  daysFromNow: z.number().min(0).max(3650).nullish().transform((val) => val ?? undefined),
  targetDate: z.union([z.date(), z.string()]).nullish().transform((val) => {
    if (!val) return undefined;
    if (val instanceof Date) return val;
    return new Date(val);
  }),
  dayOfMonth: z.number().min(1).max(31).nullish().transform((val) => val ?? undefined),
  month: z.number().min(1).max(12).nullish().transform((val) => val ?? undefined),
  daysOfWeek: z.array(z.number().min(0).max(6)).min(1, "At least one day of week must be selected").nullish().transform((val) => val ?? undefined),
  active: z.boolean().optional(),
});

const toggleActiveSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
});

export const remindersRouter = createTRPCRouter({
  list: remindersAccessProcedure.query(async ({ ctx: { db, session } }) => {
    try {
      const reminders = await getRemindersByUserId(db, session.user.id);
      // Ensure daysOfWeek is properly serialized (handle null/undefined)
      return reminders.map(reminder => ({
        ...reminder,
        daysOfWeek: reminder.daysOfWeek ?? null,
      }));
    } catch (error: any) {
      logger.error(
        { userId: session.user.id, error: error.message, stack: error.stack },
        "Failed to fetch reminders"
      );
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch reminders",
      });
    }
  }),

  get: remindersAccessProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const reminder = await getReminderById(db, input.id, session.user.id);
      
      if (!reminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      return reminder;
    }),

  create: remindersAccessProcedure
    .input(createReminderSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, reminderTitle: input.title }, "Creating reminder");
      
      const reminder = await createReminder(db, {
        userId: session.user.id,
        ...input,
      });

      if (!reminder) {
        logger.error({ userId: session.user.id, reminderTitle: input.title }, "Failed to create reminder");
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create reminder",
        });
      }

      logger.info({ userId: session.user.id, reminderId: reminder.id }, "Reminder created");
      return reminder;
    }),

  update: remindersAccessProcedure
    .input(updateReminderSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...data } = input;
      
      logger.info({ userId: session.user.id, reminderId: id }, "Updating reminder");
      
      const reminder = await updateReminder(db, id, session.user.id, data);
      
      if (!reminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      logger.info({ userId: session.user.id, reminderId: id }, "Reminder updated");
      return reminder;
    }),

  delete: remindersAccessProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, reminderId: input.id }, "Deleting reminder");
      
      const deleted = await deleteReminder(db, input.id, session.user.id);
      
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }
      
      logger.info({ userId: session.user.id, reminderId: input.id }, "Reminder deleted");
      return { success: true };
    }),

  toggleActive: remindersAccessProcedure
    .input(toggleActiveSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info(
        { userId: session.user.id, reminderId: input.id, active: input.active },
        "Toggling reminder active state"
      );
      
      const reminder = await toggleReminderActive(db, input.id, session.user.id, input.active);
      
      if (!reminder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Reminder not found",
        });
      }

      logger.info({ userId: session.user.id, reminderId: input.id }, "Reminder active state updated");
      return reminder;
    }),
});

