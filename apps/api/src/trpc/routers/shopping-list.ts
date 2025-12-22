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
import { logger } from "@imaginecalendar/logger";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { Database } from '@imaginecalendar/database/client';

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

/**
 * Use AI to automatically categorize a shopping item based on its name
 */
async function categorizeShoppingItem(
  db: Database,
  userId: string,
  itemName: string
): Promise<string | undefined> {
  try {
    // Get all folders and categories for the user
    const folders = await getUserShoppingListFolders(db, userId);
    
    // Build a flat list of all categories (folders and subfolders)
    const allCategories: Array<{ name: string; path: string }> = [];
    
    const collectCategories = (folderList: any[], parentPath: string = '') => {
      for (const folder of folderList) {
        const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;
        allCategories.push({ name: folder.name, path: fullPath });
        
        if (folder.subfolders && folder.subfolders.length > 0) {
          collectCategories(folder.subfolders, fullPath);
        }
      }
    };
    
    collectCategories(folders);
    
    // If no categories exist, return undefined (item will be added without category)
    if (allCategories.length === 0) {
      return undefined;
    }
    
    // Build AI prompt to categorize the item
    const categoryList = allCategories.map(cat => `- ${cat.path}`).join('\n');
    const prompt = `You are a shopping list categorization assistant. Analyze the shopping item name and determine which category it belongs to.

Shopping Item: "${itemName}"

Available Categories:
${categoryList}

Instructions:
1. Analyze the item name and determine the most appropriate category
2. Return ONLY the category path (e.g., "Groceries" or "Groceries/Fruits")
3. If the item doesn't fit any category well, return "NONE"
4. Be smart about categorization - "milk" should go in "Groceries" or "Dairy", "toothpaste" should go in "Personal Care" or "Health", etc.

Category:`;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn({}, 'OPENAI_API_KEY not set, skipping auto-categorization');
      return undefined;
    }

    const openaiClient = createOpenAI({ apiKey });
    const model = openaiClient('gpt-4o-mini');
    
    const result = await generateText({
      model,
      prompt,
      temperature: 0.3,
    });

    const categoryPath = result.text.trim();
    
    // Check if AI returned "NONE" or empty
    if (!categoryPath || categoryPath.toUpperCase() === 'NONE' || categoryPath.length === 0) {
      return undefined;
    }
    
    // Resolve the category path to folder ID
    const folderId = await resolveShoppingListFolderRoute(db, userId, categoryPath);
    
    if (folderId) {
      logger.info({ itemName, categoryPath, folderId, userId }, 'AI categorized shopping item');
      return folderId;
    }
    
    logger.warn({ itemName, categoryPath, userId }, 'AI suggested category but could not resolve folder ID');
    return undefined;
  } catch (error) {
    logger.error({ error, itemName, userId }, 'Failed to categorize shopping item with AI');
    // Don't fail the item creation if categorization fails - just return undefined
    return undefined;
  }
}

/**
 * Resolve shopping list folder route to folder ID (helper function for categorization)
 */
async function resolveShoppingListFolderRoute(
  db: Database,
  userId: string,
  folderRoute: string
): Promise<string | null> {
  const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
  const folders = await getUserShoppingListFolders(db, userId);
  
  // If only one part is provided, search all categories recursively
  if (parts.length === 1) {
    const folderName = parts[0].toLowerCase();
    
    // First check if it's a root folder
    const rootFolder = folders.find((f: any) => f.name.toLowerCase() === folderName);
    if (rootFolder) {
      return rootFolder.id;
    }
    
    // If not found as root folder, search all categories recursively
    const foundCategory = findSubfolderByName(folders, folderName);
    if (foundCategory) {
      return foundCategory.id;
    }
    
    return null;
  }
  
  // Multiple parts: navigate through path
  let currentFolder = folders.find((f: any) => f.name.toLowerCase() === parts[0].toLowerCase());
  if (!currentFolder) {
    return null;
  }

  // Navigate through categories
  for (let i = 1; i < parts.length; i++) {
    const category = currentFolder.subfolders?.find(
      (sf: any) => sf.name.toLowerCase() === parts[i].toLowerCase()
    );
    if (!category) {
      return null;
    }
    currentFolder = category;
  }

  return currentFolder.id;
}

/**
 * Helper function to find subfolder by name recursively
 */
function findSubfolderByName(folders: any[], folderName: string): any | null {
  for (const folder of folders) {
    if (folder.subfolders && folder.subfolders.length > 0) {
      const found = folder.subfolders.find(
        (sf: any) => sf.name.toLowerCase() === folderName.toLowerCase()
      );
      if (found) {
        return found;
      }
      
      // Recursively search deeper categories
      for (const category of folder.subfolders) {
        const deeperFound = findSubfolderByName([category], folderName);
        if (deeperFound) {
          return deeperFound;
        }
      }
    }
  }
  return null;
}

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
      
      // Auto-categorize if no folder specified
      let folderId = input.folderId;
      if (!folderId) {
        folderId = await categorizeShoppingItem(db, session.user.id, input.name);
      }
      
      const item = await createShoppingListItem(db, {
        userId: session.user.id,
        folderId,
        name: input.name,
        description: input.description,
        status: input.status || "open",
      });

      logger.info({ userId: session.user.id, itemId: item.id, folderId }, "Shopping list item created");
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
});

