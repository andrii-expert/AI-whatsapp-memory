import { connectCalendarSchema, updateCalendarSchema } from "@api/schemas/calendar";
import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserCalendars,
  getCalendarById,
  createCalendarConnection,
  updateCalendarConnection,
  deleteCalendarConnection,
  setPrimaryCalendar,
  getPrimaryCalendar,
} from "@imaginecalendar/database/queries";
import {
  updateWhatsAppCalendarSettings,
  getWhatsAppCalendars,
  updateVisibleCalendarSettings,
  getVisibleCalendars,
} from "@imaginecalendar/database/queries";
import { createCalendarProvider } from "@imaginecalendar/calendar-integrations";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const calendarRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
    const calendars = await getUserCalendars(db, session.user.id);
    
    // Fetch timezone for each active calendar
    const calendarsWithTimezone = await Promise.all(
      calendars.map(async (calendar) => {
        // If calendar is not active or has no access token, return as-is
        if (!calendar.isActive || !calendar.accessToken) {
          return { ...calendar, timeZone: undefined };
        }
        
        try {
          const provider = createCalendarProvider(calendar.provider);
          let accessToken = calendar.accessToken;
          
          // Try to get calendar timezone
          try {
            const calendarInfo = await provider.getCalendarById(accessToken, calendar.calendarId || 'primary');
            return { ...calendar, timeZone: calendarInfo.timeZone };
          } catch (error: any) {
            // If authentication fails and we have a refresh token, try refreshing
            if (calendar.refreshToken && error.message?.includes("authentication")) {
              const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
              accessToken = refreshedTokens.accessToken;
              
              // Update the calendar with the new tokens
              await updateCalendarConnection(db, calendar.id, {
                accessToken: refreshedTokens.accessToken,
                refreshToken: refreshedTokens.refreshToken,
                expiresAt: refreshedTokens.expiresAt,
              });
              
              // Retry with the new access token
              const calendarInfo = await provider.getCalendarById(accessToken, calendar.calendarId || 'primary');
              return { ...calendar, timeZone: calendarInfo.timeZone };
            } else {
              // If we can't get timezone, return without it
              logger.warn({
                userId: session.user.id,
                calendarId: calendar.id,
                error: error.message
              }, "Failed to fetch calendar timezone");
              return { ...calendar, timeZone: undefined };
            }
          }
        } catch (error: any) {
          logger.warn({
            userId: session.user.id,
            calendarId: calendar.id,
            error: error.message
          }, "Failed to fetch calendar timezone");
          return { ...calendar, timeZone: undefined };
        }
      })
    );
    
    return calendarsWithTimezone;
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

        // Get all calendars from provider
        const providerCalendars = await provider.getCalendars(tokens.accessToken);

        if (!providerCalendars || providerCalendars.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "No calendars found for this account",
          });
        }

        logger.info({ 
          userId: session.user.id, 
          provider: input.provider,
          calendarCount: providerCalendars.length
        }, "Calendars retrieved from provider");

        // Get existing calendars for this user to check for duplicates and update tokens
        const existingCalendars = await getUserCalendars(db, session.user.id);
        const existingCalendarsByProviderId = new Map(
          existingCalendars
            .filter(cal => cal.provider === input.provider && cal.email === userInfo.email)
            .map(cal => [cal.calendarId, cal])
            .filter(([id]) => Boolean(id))
        );

        // Check if user has any calendars (to determine if this is the first connection)
        const isFirstConnection = existingCalendars.length === 0;

        // Create connections for all calendars
        const createdConnections = [];
        const updatedConnections = [];
        const primaryCalendar = providerCalendars.find((cal) => cal.primary) || providerCalendars[0];

        for (const calendar of providerCalendars) {
          const existingCalendar = existingCalendarsByProviderId.get(calendar.id);
          
          // If calendar already exists, update tokens and reactivate if needed
          if (existingCalendar) {
            try {
              const updated = await updateCalendarConnection(db, existingCalendar.id, {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresAt: tokens.expiresAt,
                isActive: true, // Reactivate if it was deactivated
              });
              
              if (updated) {
                updatedConnections.push(updated);
                logger.info({
                  userId: session.user.id,
                  provider: input.provider,
                  calendarId: calendar.id,
                  calendarName: calendar.name,
                  connectionId: existingCalendar.id
                }, "Calendar connection updated with new tokens");
              }
            } catch (error: any) {
              logger.error({
                userId: session.user.id,
                provider: input.provider,
                calendarId: calendar.id,
                error: error.message
              }, "Failed to update existing calendar connection");
            }
            continue;
          }

          // Determine if this should be the primary calendar
          // Only set as primary if this is the first connection AND it's the provider's primary calendar
          const isPrimary = isFirstConnection && calendar.id === primaryCalendar.id;

          try {
            const connection = await createCalendarConnection(db, {
              userId: session.user.id,
              provider: input.provider,
              email: userInfo.email,
              calendarId: calendar.id,
              calendarName: calendar.name,
              accessToken: tokens.accessToken,
              refreshToken: tokens.refreshToken,
              expiresAt: tokens.expiresAt,
              isPrimary, // Pass isPrimary explicitly
            });

            if (connection) {
              createdConnections.push(connection);
              logger.info({ 
                userId: session.user.id, 
                provider: input.provider,
                calendarId: calendar.id,
                calendarName: calendar.name,
                connectionId: connection.id,
                isPrimary
              }, "Calendar connection created");
            }
          } catch (error: any) {
            logger.error({
              userId: session.user.id,
              provider: input.provider,
              calendarId: calendar.id,
              calendarName: calendar.name,
              error: error.message
            }, "Failed to create calendar connection");
            // Continue with other calendars even if one fails
          }
        }

        // Combine created and updated connections
        const allConnections = [...createdConnections, ...updatedConnections];

        if (allConnections.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create or update any calendar connections.",
          });
        }

        logger.info({ 
          userId: session.user.id, 
          provider: input.provider,
          createdCount: createdConnections.length,
          updatedCount: updatedConnections.length,
          totalCalendars: providerCalendars.length
        }, "Calendar connections processed successfully");

        // Auto-select calendars for WhatsApp
        // Priority: 1) Primary calendar (main calendar), 2) All newly created calendars
        try {
          // Get current WhatsApp calendar IDs
          const currentWhatsAppCalendarIds = await getWhatsAppCalendars(db, session.user.id);
          
          // Calendar IDs to add
          const calendarIdsToAdd: string[] = [];
          
          // 1. Find primary calendar - check newly created connections first, then database
          let primaryCalendarId: string | undefined;
          
          // Check if any newly created connection is marked as primary
          const primaryInCreated = createdConnections.find(conn => conn.isPrimary);
          if (primaryInCreated && primaryInCreated.calendarId) {
            primaryCalendarId = primaryInCreated.calendarId;
            logger.info({
              userId: session.user.id,
              provider: input.provider,
              primaryCalendarId: primaryInCreated.calendarId,
              primaryCalendarName: primaryInCreated.calendarName,
              source: 'newly_created',
            }, "Found primary calendar in newly created connections");
          } else {
            // If not in newly created, get from database
            const userPrimaryCalendar = await getPrimaryCalendar(db, session.user.id);
            if (userPrimaryCalendar && userPrimaryCalendar.calendarId) {
              primaryCalendarId = userPrimaryCalendar.calendarId;
              logger.info({
                userId: session.user.id,
                provider: input.provider,
                primaryCalendarId: userPrimaryCalendar.calendarId,
                primaryCalendarName: userPrimaryCalendar.calendarName,
                source: 'database',
              }, "Found primary calendar in database");
            } else if (createdConnections.length > 0) {
              // If no primary calendar exists yet, use the provider's primary calendar (main calendar)
              // This happens when adding the first calendar or when primary isn't set
              const providerPrimaryCalendar = providerCalendars.find((cal) => cal.primary) || providerCalendars[0];
              const mainCalendarConnection = createdConnections.find(conn => conn.calendarId === providerPrimaryCalendar.id);
              if (mainCalendarConnection && mainCalendarConnection.calendarId) {
                primaryCalendarId = mainCalendarConnection.calendarId;
                logger.info({
                  userId: session.user.id,
                  provider: input.provider,
                  primaryCalendarId: mainCalendarConnection.calendarId,
                  primaryCalendarName: mainCalendarConnection.calendarName,
                  source: 'provider_main_calendar',
                }, "Using provider's main calendar as primary for WhatsApp");
              }
            }
          }
          
          // Always add primary calendar if it exists
          if (primaryCalendarId) {
            calendarIdsToAdd.push(primaryCalendarId);
          }
          
          // 2. Add all newly created calendars (if any) - this will include primary if it was just created
          if (createdConnections.length > 0) {
            const newCalendarIds = createdConnections
              .map(conn => conn.calendarId)
              .filter((id): id is string => Boolean(id));
            calendarIdsToAdd.push(...newCalendarIds);
          }
          
          // Combine current and new calendar IDs, removing duplicates
          const updatedWhatsAppCalendarIds = [
            ...new Set([...currentWhatsAppCalendarIds, ...calendarIdsToAdd])
          ];
          
          // Always update to ensure primary calendar is selected (even if no new calendars)
          // This ensures primary calendar is always ticked
          await updateWhatsAppCalendarSettings(db, session.user.id, updatedWhatsAppCalendarIds);
          
          logger.info({
            userId: session.user.id,
            provider: input.provider,
            primaryCalendarId,
            newCalendarIds: createdConnections.map(c => c.calendarId).filter(Boolean),
            calendarIdsToAdd: [...new Set(calendarIdsToAdd)],
            previousCount: currentWhatsAppCalendarIds.length,
            updatedCount: updatedWhatsAppCalendarIds.length,
            hasPrimary: !!primaryCalendarId,
          }, "Auto-selected primary and newly created calendars for WhatsApp");
        } catch (error: any) {
          // Log error but don't fail the connection process
          logger.error({
            userId: session.user.id,
            provider: input.provider,
            error: error.message,
          }, "Failed to auto-select calendars for WhatsApp");
        }

        // Auto-select calendars for web display (visible on calendar page)
        // Priority: 1) Primary calendar (main calendar), 2) All newly created calendars
        try {
          // Get current visible calendar IDs (database connection IDs, not provider calendar IDs)
          const currentVisibleCalendarIds = await getVisibleCalendars(db, session.user.id);
          
          // Calendar IDs to add (these are database connection IDs, not provider calendar IDs)
          const visibleCalendarIdsToAdd: string[] = [];
          
          // 1. Find primary calendar connection ID
          let primaryConnectionId: string | undefined;
          
          // Check if any newly created connection is marked as primary
          const primaryInCreated = createdConnections.find(conn => conn.isPrimary);
          if (primaryInCreated && primaryInCreated.id) {
            primaryConnectionId = primaryInCreated.id;
            logger.info({
              userId: session.user.id,
              provider: input.provider,
              primaryConnectionId: primaryInCreated.id,
              primaryCalendarName: primaryInCreated.calendarName,
              source: 'newly_created',
            }, "Found primary calendar connection for web display");
          } else {
            // If not in newly created, get from database
            const userPrimaryCalendar = await getPrimaryCalendar(db, session.user.id);
            if (userPrimaryCalendar && userPrimaryCalendar.id) {
              primaryConnectionId = userPrimaryCalendar.id;
              logger.info({
                userId: session.user.id,
                provider: input.provider,
                primaryConnectionId: userPrimaryCalendar.id,
                primaryCalendarName: userPrimaryCalendar.calendarName,
                source: 'database',
              }, "Found primary calendar connection in database for web display");
            } else if (createdConnections.length > 0) {
              // If no primary calendar exists yet, use the provider's primary calendar (main calendar)
              const providerPrimaryCalendar = providerCalendars.find((cal) => cal.primary) || providerCalendars[0];
              const mainCalendarConnection = createdConnections.find(conn => conn.calendarId === providerPrimaryCalendar.id);
              if (mainCalendarConnection && mainCalendarConnection.id) {
                primaryConnectionId = mainCalendarConnection.id;
                logger.info({
                  userId: session.user.id,
                  provider: input.provider,
                  primaryConnectionId: mainCalendarConnection.id,
                  primaryCalendarName: mainCalendarConnection.calendarName,
                  source: 'provider_main_calendar',
                }, "Using provider's main calendar connection for web display");
              }
            }
          }
          
          // Always add primary calendar connection ID if it exists
          if (primaryConnectionId) {
            visibleCalendarIdsToAdd.push(primaryConnectionId);
          }
          
          // 2. Add all newly created calendar connection IDs (if any)
          if (createdConnections.length > 0) {
            const newConnectionIds = createdConnections
              .map(conn => conn.id)
              .filter((id): id is string => Boolean(id));
            visibleCalendarIdsToAdd.push(...newConnectionIds);
          }
          
          // Combine current and new calendar connection IDs, removing duplicates
          const updatedVisibleCalendarIds = [
            ...new Set([...currentVisibleCalendarIds, ...visibleCalendarIdsToAdd])
          ];
          
          // Always update to ensure primary calendar is visible (even if no new calendars)
          // This ensures primary calendar is always ticked on the web
          await updateVisibleCalendarSettings(db, session.user.id, updatedVisibleCalendarIds);
          
          logger.info({
            userId: session.user.id,
            provider: input.provider,
            primaryConnectionId,
            newConnectionIds: createdConnections.map(c => c.id).filter(Boolean),
            visibleCalendarIdsToAdd: [...new Set(visibleCalendarIdsToAdd)],
            previousCount: currentVisibleCalendarIds.length,
            updatedCount: updatedVisibleCalendarIds.length,
            hasPrimary: !!primaryConnectionId,
          }, "Auto-selected primary and newly created calendars for web display");
        } catch (error: any) {
          // Log error but don't fail the connection process
          logger.error({
            userId: session.user.id,
            provider: input.provider,
            error: error.message,
          }, "Failed to auto-select calendars for web display");
        }

        // Return the primary calendar connection (or first one if no primary)
        const primaryConnection = allConnections.find(conn => conn.calendarId === primaryCalendar.id);
        return primaryConnection || allConnections[0];
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

      if (!calendar.calendarId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar configuration error",
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

  createEvent: protectedProcedure
    .input(z.object({
      calendarId: z.string(),
      title: z.string().min(1, "Event title is required"),
      start: z.string(), // ISO date string
      end: z.string().optional(), // ISO date string
      description: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional().default(false),
      createGoogleMeet: z.boolean().optional().default(false),
      color: z.string().optional(),
      attendees: z.array(z.string().email()).optional().default([]), // Array of email addresses
    }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.calendarId);

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

      if (!calendar.calendarId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar configuration error",
        });
      }

      try {
        logger.info({
          userId: session.user.id,
          calendarId: input.calendarId,
          provider: calendar.provider,
          eventTitle: input.title
        }, "Creating calendar event");

        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // Parse dates
        const startDate = new Date(input.start);
        const endDate = input.end ? new Date(input.end) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour duration

        // Try to create event
        try {
          const createdEvent = await provider.createEvent(accessToken, {
            calendarId: calendar.calendarId,
            title: input.title,
            start: startDate,
            end: endDate,
            description: input.description,
            location: input.location,
            allDay: input.allDay || false,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            createGoogleMeet: input.createGoogleMeet || false,
            color: input.color || undefined,
            attendees: input.attendees || [],
          });

          logger.info({
            userId: session.user.id,
            calendarId: input.calendarId,
            eventId: createdEvent.id
          }, "Calendar event created successfully");

          return {
            success: true,
            event: createdEvent,
            message: "Event created successfully"
          };
        } catch (error: any) {
          // If authentication fails and we have a refresh token, try refreshing
          if (calendar.refreshToken && error.message?.includes("authentication")) {
            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              provider: calendar.provider
            }, "Access token failed during event creation, attempting refresh");

            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry with the new access token
            const createdEvent = await provider.createEvent(accessToken, {
              calendarId: calendar.calendarId,
              title: input.title,
              start: startDate,
              end: endDate,
              description: input.description,
              location: input.location,
              allDay: input.allDay || false,
              attendees: input.attendees || [],
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });

            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              eventId: createdEvent.id
            }, "Calendar event created successfully after token refresh");

            return {
              success: true,
              event: createdEvent,
              message: "Event created successfully"
            };
          } else {
            throw error;
          }
        }
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.calendarId,
          error: error.message
        }, "Failed to create calendar event");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create event: ${error.message}`,
        });
      }
    }),

  updateEvent: protectedProcedure
    .input(z.object({
      calendarId: z.string(),
      eventId: z.string(),
      title: z.string().min(1, "Event title is required").optional(),
      start: z.string().optional(), // ISO date string
      end: z.string().optional(), // ISO date string
      description: z.string().optional(),
      location: z.string().optional(),
      allDay: z.boolean().optional().default(false),
      createGoogleMeet: z.boolean().optional(),
      color: z.string().optional(),
      attendees: z.array(z.string().email()).optional(), // Array of email addresses
    }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.calendarId);

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

      if (!calendar.calendarId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar configuration error",
        });
      }

      try {
        logger.info({
          userId: session.user.id,
          calendarId: input.calendarId,
          eventId: input.eventId,
          hasTitle: !!input.title,
          hasStart: !!input.start,
          hasEnd: !!input.end,
          createGoogleMeet: input.createGoogleMeet
        }, "Updating calendar event");

        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // Parse and validate dates if provided
        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (input.start) {
          startDate = new Date(input.start);
          if (isNaN(startDate.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid start date format",
            });
          }
        }

        if (input.end) {
          endDate = new Date(input.end);
          if (isNaN(endDate.getTime())) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Invalid end date format",
            });
          }
        }

        // Validate required parameters
        if (!calendar.calendarId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Calendar configuration error",
          });
        }

        if (!input.eventId || typeof input.eventId !== 'string') {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid event ID",
          });
        }

        // Try to update event
        try {
          const updateParams: any = {
            calendarId: calendar.calendarId,
            eventId: input.eventId,
            allDay: input.allDay || false,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          };

          // Only include optional fields if they have values
          if (input.title !== undefined && input.title !== null && input.title.trim()) {
            updateParams.title = input.title.trim();
          }
          if (input.description !== undefined && input.description !== null) {
            updateParams.description = input.description;
          }
          if (startDate) {
            updateParams.start = startDate;
          }
          if (endDate) {
            updateParams.end = endDate;
          }
          if (input.location !== undefined && input.location !== null && input.location.trim()) {
            updateParams.location = input.location.trim();
          }
          if (input.createGoogleMeet !== undefined) {
            updateParams.createGoogleMeet = input.createGoogleMeet;
          }
          if (input.color !== undefined && input.color !== null) {
            updateParams.color = input.color;
          }
          if (input.attendees !== undefined) {
            updateParams.attendees = input.attendees;
          }

          logger.info({
            userId: session.user.id,
            updateParams: { ...updateParams, calendarId: '[REDACTED]' },
          }, "Calling provider.updateEvent");

          const updatedEvent = await provider.updateEvent(accessToken, updateParams);

          logger.info({
            userId: session.user.id,
            calendarId: input.calendarId,
            eventId: input.eventId,
            hasConferenceUrl: !!updatedEvent.conferenceUrl
          }, "Calendar event updated successfully");

          return {
            success: true,
            event: updatedEvent,
            message: "Event updated successfully"
          };
        } catch (error: any) {
          // If authentication fails and we have a refresh token, try refreshing
          if (calendar.refreshToken && error.message?.includes("authentication")) {
            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              provider: calendar.provider
            }, "Access token failed during event update, attempting refresh");

            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry with the new access token
            const updatedEvent = await provider.updateEvent(accessToken, {
              calendarId: calendar.calendarId,
              eventId: input.eventId,
              title: input.title,
              description: input.description,
              start: startDate,
              end: endDate,
              allDay: input.allDay || false,
              location: input.location,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              createGoogleMeet: input.createGoogleMeet,
              attendees: input.attendees,
            });

            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              eventId: input.eventId
            }, "Calendar event updated successfully after token refresh");

            return {
              success: true,
              event: updatedEvent,
              message: "Event updated successfully"
            };
          } else {
            throw error;
          }
        }
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.calendarId,
          eventId: input.eventId,
          error: error.message
        }, "Failed to update calendar event");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to update event: ${error.message}`,
        });
      }
    }),

  getEvents: protectedProcedure
    .input(z.object({
      calendarId: z.string(),
      timeMin: z.string().optional(), // ISO date string
      timeMax: z.string().optional(), // ISO date string
      maxResults: z.number().optional().default(10000),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.calendarId);

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

      if (!calendar.calendarId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar configuration error",
        });
      }

      try {
        logger.info({
          userId: session.user.id,
          calendarId: input.calendarId,
          provider: calendar.provider
        }, "Fetching calendar events");

        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // Parse dates
        const timeMin = input.timeMin ? new Date(input.timeMin) : new Date();
        const timeMax = input.timeMax ? new Date(input.timeMax) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // Default 30 days ahead

        // Try to fetch events
        try {
          const events = await provider.searchEvents(accessToken, {
            calendarId: calendar.calendarId,
            timeMin,
            timeMax,
            maxResults: input.maxResults,
          });

          logger.info({
            userId: session.user.id,
            calendarId: input.calendarId,
            eventCount: events.length
          }, "Calendar events fetched successfully");

          return events.map(event => ({
            id: event.id,
            title: event.title,
            description: event.description,
            start: event.start.toISOString(),
            end: event.end.toISOString(),
            location: event.location,
            htmlLink: event.htmlLink,
            webLink: event.webLink,
            color: event.color,
          }));
        } catch (error: any) {
          // If authentication fails and we have a refresh token, try refreshing
          if (calendar.refreshToken && error.message?.includes("authentication")) {
            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              provider: calendar.provider
            }, "Access token failed during event fetch, attempting refresh");

            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry with the new access token
            const events = await provider.searchEvents(accessToken, {
              calendarId: calendar.calendarId,
              timeMin,
              timeMax,
              maxResults: input.maxResults,
            });

            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              eventCount: events.length
            }, "Calendar events fetched successfully after token refresh");

            return events.map(event => ({
              id: event.id,
              title: event.title,
              description: event.description,
              start: event.start.toISOString(),
              end: event.end.toISOString(),
              location: event.location,
              htmlLink: event.htmlLink,
              webLink: event.webLink,
              color: event.color,
            }));
          } else {
            throw error;
          }
        }
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.calendarId,
          error: error.message
        }, "Failed to fetch calendar events");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch events: ${error.message}`,
        });
      }
    }),

    getEvent: protectedProcedure
      .input(z.object({
        calendarId: z.string(),
        eventId: z.string(),
      }))
      .query(async ({ ctx: { db, session }, input }) => {
        const calendar = await getCalendarById(db, input.calendarId);

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
          const provider = createCalendarProvider(calendar.provider);
          let accessToken = calendar.accessToken;

          // Try to get the event
          try {
            const event = await provider.getEvent(accessToken, {
              calendarId: calendar.calendarId!,
              eventId: input.eventId,
            });

            return event;
          } catch (error: any) {
            // If authentication fails and we have a refresh token, try refreshing
            if (calendar.refreshToken && error.message?.includes("authentication")) {
              const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
              accessToken = refreshedTokens.accessToken;

              // Update the calendar with the new tokens
              await updateCalendarConnection(db, calendar.id, {
                accessToken: refreshedTokens.accessToken,
                refreshToken: refreshedTokens.refreshToken,
                expiresAt: refreshedTokens.expiresAt,
              });

              // Retry with the new access token
              const event = await provider.getEvent(accessToken, {
                calendarId: calendar.calendarId!,
                eventId: input.eventId,
              });

              return event;
            }
            throw error;
          }
        } catch (error: any) {
          logger.error({
            userId: session.user.id,
            calendarId: input.calendarId,
            eventId: input.eventId,
            error: error.message
          }, "Failed to get calendar event");

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Failed to get event: ${error.message}`,
          });
        }
      }),

  deleteEvent: protectedProcedure
    .input(z.object({
      calendarId: z.string(),
      eventId: z.string(),
    }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      const calendar = await getCalendarById(db, input.calendarId);

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

      if (!calendar.calendarId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Calendar configuration error",
        });
      }

      try {
        const provider = createCalendarProvider(calendar.provider);
        let accessToken = calendar.accessToken;

        // Try to delete the event
        try {
          await provider.deleteEvent(accessToken, {
            calendarId: calendar.calendarId,
            eventId: input.eventId,
          });

          logger.info({
            userId: session.user.id,
            calendarId: input.calendarId,
            eventId: input.eventId,
          }, "Calendar event deleted successfully");

          return {
            success: true,
            message: "Event deleted successfully",
          };
        } catch (error: any) {
          // If authentication fails and we have a refresh token, try refreshing
          if (calendar.refreshToken && error.message?.includes("authentication")) {
            const refreshedTokens = await provider.refreshTokens(calendar.refreshToken);
            accessToken = refreshedTokens.accessToken;

            // Update the calendar with the new tokens
            await updateCalendarConnection(db, calendar.id, {
              accessToken: refreshedTokens.accessToken,
              refreshToken: refreshedTokens.refreshToken,
              expiresAt: refreshedTokens.expiresAt,
            });

            // Retry with the new access token
            await provider.deleteEvent(accessToken, {
              calendarId: calendar.calendarId,
              eventId: input.eventId,
            });

            logger.info({
              userId: session.user.id,
              calendarId: input.calendarId,
              eventId: input.eventId,
            }, "Calendar event deleted successfully after token refresh");

            return {
              success: true,
              message: "Event deleted successfully",
            };
          }
          throw error;
        }
      } catch (error: any) {
        logger.error({
          userId: session.user.id,
          calendarId: input.calendarId,
          eventId: input.eventId,
          error: error.message
        }, "Failed to delete calendar event");

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete event: ${error.message}`,
        });
      }
    }),
  });