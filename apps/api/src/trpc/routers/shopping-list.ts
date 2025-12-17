import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserShoppingListItems,
  getShoppingListItemById,
  createShoppingListItem,
  updateShoppingListItem,
  deleteShoppingListItem,
  toggleShoppingListItemStatus,
} from "@imaginecalendar/database/queries";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Shopping list item schemas
const createShoppingListItemSchema = z.object({
  name: z.string().min(1, "Item name is required").max(500),
  description: z.string().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
});

const updateShoppingListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
  sortOrder: z.number().optional(),
});

const getShoppingListItemsSchema = z.object({
  status: z.enum(["open", "completed", "archived"]).optional(),
});

export const shoppingListRouter = createTRPCRouter({
  list: protectedProcedure
    .input(getShoppingListItemsSchema.optional())
    .query(async ({ ctx: { db, session }, input }) => {
      const items = await getUserShoppingListItems(db, session.user.id, {
        status: input?.status,
      });
      return items;
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx: { db, session }, input }) => {
      const item = await getShoppingListItemById(db, input.id, session.user.id);
      
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shopping list item not found",
        });
      }

      return item;
    }),

  create: protectedProcedure
    .input(createShoppingListItemSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, itemName: input.name }, "Creating shopping list item");
      
      const item = await createShoppingListItem(db, {
        userId: session.user.id,
        name: input.name,
        description: input.description,
        status: input.status || "open",
      });

      logger.info({ userId: session.user.id, itemId: item.id }, "Shopping list item created");
      return item;
    }),

  update: protectedProcedure
    .input(updateShoppingListItemSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, ...updateData } = input;
      
      logger.info({ userId: session.user.id, itemId: id, updates: Object.keys(updateData) }, "Updating shopping list item");
      
      const item = await updateShoppingListItem(db, id, session.user.id, updateData);
      
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shopping list item not found",
        });
      }

      logger.info({ userId: session.user.id, itemId: item.id }, "Shopping list item updated");
      return item;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, itemId: input.id }, "Deleting shopping list item");
      
      const item = await deleteShoppingListItem(db, input.id, session.user.id);
      
      if (!item) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shopping list item not found",
        });
      }

      logger.info({ userId: session.user.id, itemId: item.id }, "Shopping list item deleted");
      return item;
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx: { db, session }, input }) => {
      logger.info({ userId: session.user.id, itemId: input.id }, "Toggling shopping list item status");
      
      const item = await toggleShoppingListItemStatus(db, input.id, session.user.id);
      
      logger.info({ userId: session.user.id, itemId: item.id, newStatus: item.status }, "Shopping list item status toggled");
      return item;
    }),
});

