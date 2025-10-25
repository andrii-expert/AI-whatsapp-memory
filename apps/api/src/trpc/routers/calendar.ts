import { connectCalendarSchema, updateCalendarSchema } from "@api/schemas/calendar";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserCalendars,
  getCalendarById,
  createCalendarConnection,
  updateCalendarConnection,
  deleteCalendarConnection,
  setPrimaryCalendar,
} from "@imaginecalendar/database/queries";
import { createCalendarProvider } from "@imaginecalendar/calendar-integrations";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const calendarRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    return getUserCalendars(db, session.user.id);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);
      
      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      return calendar;
    }),

  connect: protectedProcedure
    .input(connectCalendarSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      try {
        logger.info({ 
          userId: session.user.id, 
          provider: input.provider 
        }, "Starting calendar connection");


        // Create provider instance
        const provider = createCalendarProvider(input.provider);

        // Exchange OAuth code for tokens
        const tokens = await provider.exchangeCodeForTokens(
          input.code,
          input.redirectUri
        );

        logger.info({
          userId: session.user.id,
          provider: input.provider,
          hasRefreshToken: !!tokens.refreshToken
        }, "OAuth tokens received");

        // Get user info from the calendar provider
        const userInfo = await provider.getUserInfo(tokens.accessToken);

        logger.info({
          userId: session.user.id,
          provider: input.provider,
          calendarUserEmail: userInfo.email,
          calendarUserName: userInfo.name
        }, "Calendar user info retrieved");

        // Get primary calendar info from provider
        const calendars = await provider.getCalendars(tokens.accessToken);
        const primaryCalendar = calendars.find((cal) => cal.primary) || calendars[0];

        if (!primaryCalendar) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No calendars found for this account",
          });
        }

        logger.info({ 
          userId: session.user.id, 
          provider: input.provider,
          calendarId: primaryCalendar.id,
          calendarName: primaryCalendar.name
        }, "Primary calendar identified");

        // Create calendar connection in database
        const connection = await createCalendarConnection(db, {
          userId: session.user.id,
          provider: input.provider,
          email: userInfo.email,
          calendarId: primaryCalendar.id,
          calendarName: primaryCalendar.name,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        });

        if (!connection) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create calendar connection",
          });
        }

        logger.info({ 
          userId: session.user.id, 
          provider: input.provider,
          connectionId: connection.id
        }, "Calendar connection created successfully");

        return connection;
      } catch (error: any) {
        logger.error({ 
          userId: session.user.id, 
          provider: input.provider,
          error: error.message 
        }, "Calendar connection failed");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to connect ${input.provider} calendar: ${error.message}`,
        });
      }
    }),

  update: protectedProcedure
    .input(updateCalendarSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);

      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      // Handle primary calendar setting
      if (input.isPrimary) {
        await setPrimaryCalendar(db, session.user.id, input.id);
        // setPrimaryCalendar handles the update, so return the updated calendar
        return getCalendarById(db, input.id);
      }

      // Map the input data to match the database schema
      const updateData: Parameters<typeof updateCalendarConnection>[2] = {};

      if (input.name !== undefined) {
        updateData.calendarName = input.name;
      }

      if (input.syncEnabled !== undefined) {
        updateData.isActive = input.syncEnabled;
      }

      // Note: color is not in our schema, would need to add if needed
      // isPrimary is handled separately above

      return updateCalendarConnection(db, input.id, updateData);
    }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);
      
      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      return deleteCalendarConnection(db, input.id);
    }),

  testConnection: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);
      
      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      if (!calendar.accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Calendar has no access token",
        });
      }

      try {
        logger.info({ 
          userId: session.user.id, 
          calendarId: input.id,
          provider: calendar.provider 
        }, "Testing calendar connection");

        // Ensure provider is supported
        if (calendar.provider !== "google" && calendar.provider !== "microsoft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider ${calendar.provider} is not currently supported for testing`,
          });
        }

        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // First, try with the current access token
        let result = await provider.testConnection(accessToken);

        // If the test fails with authentication error and we have a refresh token, try refreshing
        if (!result.success && calendar.refreshToken && result.message?.includes("authentication")) {
          try {
            logger.info({
              userId: session.user.id,
              calendarId: input.id,
              provider: calendar.provider
            }, "Access token failed, attempting refresh");

            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry the test with the new access token
            result = await provider.testConnection(accessToken);

            if (result.success) {
              logger.info({
                userId: session.user.id,
                calendarId: input.id,
                provider: calendar.provider
              }, "Calendar connection test successful after token refresh");
            }
          } catch (refreshError: any) {
            logger.error({
              userId: session.user.id,
              calendarId: input.id,
              provider: calendar.provider,
              error: refreshError.message
            }, "Token refresh failed during test");

            // Return the original test failure, not the refresh error
          }
        }

        if (result.success) {
          logger.info({ 
            userId: session.user.id, 
            calendarId: input.id,
            provider: calendar.provider 
          }, "Calendar connection test successful");
        } else {
          logger.warn({ 
            userId: session.user.id, 
            calendarId: input.id,
            provider: calendar.provider,
            error: result.message 
          }, "Calendar connection test failed");
        }

        return result;
      } catch (error: any) {
        logger.error({ 
          userId: session.user.id, 
          calendarId: input.id,
          provider: calendar.provider,
          error: error.message 
        }, "Calendar connection test error");

        return {
          success: false,
          message: `Connection test failed: ${error.message}`
        };
      }
    }),

  getAvailableCalendars: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);

      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      if (!calendar.accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Calendar has no access token",
        });
      }

      try {
        // Ensure provider is supported
        if (calendar.provider !== "google" && calendar.provider !== "microsoft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider ${calendar.provider} is not currently supported`,
          });
        }

        const provider = createCalendarProvider(calendar.provider);
        const calendars = await provider.getCalendars(calendar.accessToken);

        logger.info({
          userId: session.user.id,
          calendarId: input.id,
          provider: calendar.provider,
          calendarCount: calendars.length
        }, "Retrieved available calendars");

        return calendars.map(cal => ({
          id: cal.id,
          name: cal.name,
          description: cal.description,
          primary: cal.primary,
          canEdit: cal.canEdit,
          color: cal.color,
        }));
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.id,
          error: error.message
        }, "Failed to retrieve available calendars");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get calendars: ${error.message}`,
        });
      }
    }),

  updateSelectedCalendar: protectedProcedure
    .input(z.object({
      id: z.string(),
      calendarId: z.string(),
      calendarName: z.string(),
    }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.id);

      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      try {
        logger.info({
          userId: session.user.id,
          connectionId: input.id,
          newCalendarId: input.calendarId,
          newCalendarName: input.calendarName
        }, "Updating selected calendar");

        const updated = await updateCalendarConnection(db, input.id, {
          calendarId: input.calendarId,
          calendarName: input.calendarName,
        });

        logger.info({
          userId: session.user.id,
          connectionId: input.id
        }, "Selected calendar updated successfully");

        return updated;
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          connectionId: input.id,
          error: error.message
        }, "Failed to update selected calendar");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update calendar: ${error.message}`,
        });
      }
    }),

  sync: protectedProcedure
    .input(z.object({
      id: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const { session, db } = ctx;

      const calendar = await getCalendarById(db, input.id);

      if (!calendar || calendar.userId !== session.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calendar not found",
        });
      }

      if (!calendar.accessToken || !calendar.isActive) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Calendar is not connected or active",
        });
      }

      try {
        logger.info({
          userId: session.user.id,
          calendarId: input.id,
          provider: calendar.provider
        }, "Starting calendar sync");

        // Ensure provider is supported
        if (calendar.provider !== "google" && calendar.provider !== "microsoft") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Provider ${calendar.provider} is not currently supported for syncing`,
          });
        }

        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // Try to get calendars (this will test the connection and read calendar data)
        let calendars;
        try {
          calendars = await provider.getCalendars(accessToken);
        } catch (error: any) {
          // If authentication fails and we have a refresh token, try refreshing
          if (calendar.refreshToken && error.message?.includes("authentication")) {
            logger.info({
              userId: session.user.id,
              calendarId: input.id,
              provider: calendar.provider
            }, "Access token failed during sync, attempting refresh");

            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry with the new access token
            calendars = await provider.getCalendars(accessToken);
          } else {
            throw error;
          }
        }

        // Record successful sync
        await updateCalendarConnection(db, calendar.id, {
          lastSyncAt: new Date(),
          lastSyncError: undefined,
          syncFailureCount: 0,
        });

        logger.info({
          userId: session.user.id,
          calendarId: input.id,
          provider: calendar.provider,
          calendarCount: calendars.length
        }, "Calendar sync completed successfully");

        return {
          success: true,
          message: `Successfully synced ${calendars.length} calendar(s)`,
          calendarCount: calendars.length
        };

      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.id,
          provider: calendar.provider,
          error: error.message
        }, "Calendar sync failed");

        // Record sync error
        await updateCalendarConnection(db, calendar.id, {
          lastSyncError: error.message,
          syncFailureCount: (calendar.syncFailureCount || 0) + 1,
        });

        return {
          success: false,
          message: `Sync failed: ${error.message}`
        };
      }
    }),
});