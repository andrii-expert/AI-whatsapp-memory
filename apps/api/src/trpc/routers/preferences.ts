import { updatePreferencesSchema } from "@api/schemas/preferences";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserPreferences,
  updateNotificationPreferences,
  updateReminderSettings,
  updateLocaleSettings,
  resetPreferencesToDefault,
  setDefaultCalendar,
} from "@imaginecalendar/database/queries";
import { TRPCError } from "@trpc/server";

export const preferencesRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    const preferences = await getUserPreferences(db, session.user.id);
    
    if (!preferences) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Preferences not found",
      });
    }

    return preferences;
  }),

  update: protectedProcedure
    .input(updatePreferencesSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const promises = [];

      if (input.notifications) {
        promises.push(
          updateNotificationPreferences(db, session.user.id, input.notifications)
        );
      }

      if (input.reminders) {
        // Get current preferences to merge with new values
        const current = await getUserPreferences(db, session.user.id);
        if (current) {
          promises.push(
            updateReminderSettings(db, session.user.id, {
              reminderMinutes: input.reminders.reminderMinutes ?? current.reminderMinutes,
              reminderNotifications: current.reminderNotifications, // Keep existing value
            })
          );
          
          // Handle defaultCalendarId separately if provided
          if (input.reminders.defaultCalendarId !== undefined) {
            promises.push(
              setDefaultCalendar(db, session.user.id, input.reminders.defaultCalendarId)
            );
          }
        }
      }

      if (input.locale) {
        promises.push(
          updateLocaleSettings(db, session.user.id, input.locale)
        );
      }

      await Promise.all(promises);

      // Return updated preferences
      return getUserPreferences(db, session.user.id);
    }),

  reset: protectedProcedure
    .mutation(async ({ ctx: { db, session } }) => {
      return resetPreferencesToDefault(db, session.user.id);
    }),
});