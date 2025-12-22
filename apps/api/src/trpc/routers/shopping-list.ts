import { createTRPCRouter, protectedProcedure } from "@api/trpc/init";
import {
  getUserShoppingListItems,
  getShoppingListItemById,
  createShoppingListItem,
  updateShoppingListItem,
  deleteShoppingListItem,
  toggleShoppingListItemStatus,
  getUserShoppingListFolders,
  getShoppingListFolderById,
  createShoppingListFolder,
  updateShoppingListFolder,
  deleteShoppingListFolder,
} from "@imaginecalendar/database/queries";
import { suggestShoppingListCategory } from "@imaginecalendar/ai-services";
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Folder schemas
const createShoppingListFolderSchema = z.object({
  name: z.string().min(1, "Folder name is required").max(100),
  parentId: z.string().uuid().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const updateShoppingListFolderSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  sortOrder: z.number().optional(),
});

// Shopping list item schemas
const createShoppingListItemSchema = z.object({
  folderId: z.string().uuid().optional(),
  name: z.string().min(1, "Item name is required").max(500),
  description: z.string().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
});

const updateShoppingListItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  folderId: z.string().uuid().nullable().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
  sortOrder: z.number().optional(),
});

const getShoppingListItemsSchema = z.object({
  folderId: z.string().uuid().optional(),
  status: z.enum(["open", "completed", "archived"]).optional(),
});

export const shoppingListRouter = createTRPCRouter({
  // ============================================
  // Folder Endpoints
  // ============================================
  
  folders: createTRPCRouter({
    list: protectedProcedure.query(async ({ ctx: { db, session } }) => {
      const folders = await getUserShoppingListFolders(db, session.user.id);
      return folders;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ ctx: { db, session }, input }) => {
        const folder = await getShoppingListFolderById(db, input.id, session.user.id);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        return folder;
      }),

    create: protectedProcedure
      .input(createShoppingListFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderName: input.name }, "Creating shopping list folder");
        
        const folder = await createShoppingListFolder(db, {
          userId: session.user.id,
          ...input,
        });

        if (!folder) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create folder",
          });
        }

        logger.info({ userId: session.user.id, folderId: folder.id }, "Shopping list folder created");
        return folder;
      }),

    update: protectedProcedure
      .input(updateShoppingListFolderSchema)
      .mutation(async ({ ctx: { db, session }, input }) => {
        const { id, ...data } = input;
        
        logger.info({ userId: session.user.id, folderId: id }, "Updating shopping list folder");
        
        const folder = await updateShoppingListFolder(db, id, session.user.id, data);
        
        if (!folder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Folder not found",
          });
        }

        logger.info({ userId: session.user.id, folderId: id }, "Shopping list folder updated");
        return folder;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ ctx: { db, session }, input }) => {
        logger.info({ userId: session.user.id, folderId: input.id }, "Deleting shopping list folder");
        
        await deleteShoppingListFolder(db, input.id, session.user.id);
        
        logger.info({ userId: session.user.id, folderId: input.id }, "Shopping list folder deleted");
        return { success: true };
      }),
  }),

  // ============================================
  // Shopping List Item Endpoints
  // ============================================
  list: protectedProcedure
    .input(getShoppingListItemsSchema.optional())
    .query(async ({ ctx: { db, session }, input }) => {
      const items = await getUserShoppingListItems(db, session.user.id, {
        folderId: input?.folderId,
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
        folderId: input.folderId,
        name: input.name,
        description: input.description,
        status: input.status || "open",
      });

      if (!item) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create item",
        });
      }

      logger.info({ userId: session.user.id, itemId: item.id }, "Shopping list item created");
      return item;
    }),

  update: protectedProcedure
    .input(updateShoppingListItemSchema)
    .mutation(async ({ ctx: { db, session }, input }) => {
      const { id, folderId, ...updateData } = input;
      
      logger.info({ userId: session.user.id, itemId: id, updates: Object.keys(updateData) }, "Updating shopping list item");
      
      const item = await updateShoppingListItem(db, id, session.user.id, {
        ...updateData,
        folderId: folderId !== undefined ? folderId : undefined,
      });
      
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

  // Get AI category suggestion
  suggestCategory: protectedProcedure
    .input(z.object({
      itemName: z.string().min(1),
      description: z.string().optional(),
      parentFolderId: z.string().uuid().optional(),
    }))
    .query(async ({ ctx: { db, session }, input }) => {
      try {
        // Get all folders to extract existing categories
        const allFolders = await getUserShoppingListFolders(db, session.user.id);
        
        // Helper function to find a folder by ID recursively
        const findFolderById = (folders: any[], targetId: string): any | null => {
          for (const folder of folders) {
            if (folder.id === targetId) {
              return folder;
            }
            if (folder.subfolders && folder.subfolders.length > 0) {
              const found = findFolderById(folder.subfolders, targetId);
              if (found) return found;
            }
          }
          return null;
        };
        
        // Extract all existing category names (subfolders)
        const extractCategories = (folders: any[]): string[] => {
          const categories: string[] = [];
          for (const folder of folders) {
            if (folder.subfolders && folder.subfolders.length > 0) {
              for (const subfolder of folder.subfolders) {
                categories.push(subfolder.name.toLowerCase());
                if (subfolder.subfolders && subfolder.subfolders.length > 0) {
                  categories.push(...extractCategories([subfolder]));
                }
              }
            }
          }
          return categories;
        };

        // If parentFolderId is provided, only extract categories from that parent folder
        let existingCategories: string[];
        if (input.parentFolderId) {
          const parentFolder = findFolderById(allFolders, input.parentFolderId);
          if (parentFolder && parentFolder.subfolders) {
            existingCategories = extractCategories([parentFolder]);
          } else {
            existingCategories = [];
          }
        } else {
          existingCategories = extractCategories(allFolders);
        }

        // Combine item name and description for AI analysis
        const itemText = input.description 
          ? `${input.itemName} ${input.description}`.trim()
          : input.itemName;

        // Get AI suggestion with timeout
        const timeoutPromise = new Promise<null>((resolve) => {
          setTimeout(() => resolve(null), 8000); // 8 second timeout
        });

        const aiPromise = suggestShoppingListCategory(itemText, existingCategories);
        const categoryResult = await Promise.race([aiPromise, timeoutPromise]);

        if (!categoryResult || !categoryResult.suggestedCategory) {
          return { suggestedCategory: null };
        }

        return {
          suggestedCategory: categoryResult.suggestedCategory,
          confidence: categoryResult.confidence,
        };
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            userId: session.user.id,
            itemName: input.itemName,
          },
          "Failed to get AI category suggestion"
        );
        return { suggestedCategory: null };
      }
    }),
});