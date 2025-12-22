import type { Database } from '@imaginecalendar/database/client';
import { getUserShoppingListFolders, createShoppingListFolder } from '@imaginecalendar/database/queries';
import { suggestShoppingListCategory } from '@imaginecalendar/ai-services';
import { logger } from '@imaginecalendar/logger';

/**
 * Helper function to find or create an appropriate subfolder for a shopping list item
 * Uses AI to analyze the item name and suggest/create a category
 * @param db - Database instance
 * @param userId - User ID
 * @param itemName - Name of the shopping list item
 * @param parentFolderId - Optional parent folder ID (if item should go into a specific folder's subfolder)
 *                        If provided, will create/find subfolder within that parent folder
 * @returns The folder ID to use for the item, or undefined if no category is needed
 */
export async function findOrCreateCategoryForItem(
  db: Database,
  userId: string,
  itemName: string,
  parentFolderId?: string
): Promise<string | undefined> {
  try {
    // Get all folders to extract existing categories
    const allFolders = await getUserShoppingListFolders(db, userId);
    
    // Extract all existing category names (subfolders)
    const extractCategories = (folders: any[]): string[] => {
      const categories: string[] = [];
      for (const folder of folders) {
        if (folder.subfolders && folder.subfolders.length > 0) {
          for (const subfolder of folder.subfolders) {
            categories.push(subfolder.name.toLowerCase());
            // Also check nested subfolders
            if (subfolder.subfolders && subfolder.subfolders.length > 0) {
              categories.push(...extractCategories([subfolder]));
            }
          }
        }
      }
      return categories;
    };

    const existingCategories = extractCategories(allFolders);

    // Use AI to suggest a category
    const categoryResult = await suggestShoppingListCategory(itemName, existingCategories);

    if (!categoryResult || !categoryResult.suggestedCategory) {
      logger.info({ itemName, userId }, 'No category suggested for shopping list item');
      return undefined;
    }

    const suggestedCategory = categoryResult.suggestedCategory.trim();

    // Find existing category (case-insensitive)
    const findCategoryInFolders = (folders: any[], categoryName: string, parentId?: string): string | null => {
      for (const folder of folders) {
        // If parentFolderId is specified, only search within that folder
        if (parentFolderId && folder.id !== parentFolderId) {
          continue;
        }

        if (folder.subfolders && folder.subfolders.length > 0) {
          for (const subfolder of folder.subfolders) {
            if (subfolder.name.toLowerCase() === categoryName.toLowerCase()) {
              return subfolder.id;
            }
            // Check nested subfolders
            if (subfolder.subfolders && subfolder.subfolders.length > 0) {
              const found = findCategoryInFolders([subfolder], categoryName);
              if (found) return found;
            }
          }
        }
      }
      return null;
    };

    // First, try to find existing category
    const existingCategoryId = findCategoryInFolders(allFolders, suggestedCategory, parentFolderId);

    if (existingCategoryId) {
      logger.info({ itemName, categoryId: existingCategoryId, categoryName: suggestedCategory, userId }, 'Found existing category for shopping list item');
      return existingCategoryId;
    }

    // Category doesn't exist, create it
    // If parentFolderId is specified, create subfolder under that folder
    // Otherwise, find or create a "General" folder to put categories under
    let targetParentId = parentFolderId;

    if (!targetParentId) {
      // Find or create "General" folder
      let generalFolder = allFolders.find(f => f.name.toLowerCase() === 'general');
      
      if (!generalFolder) {
        logger.info({ userId }, 'Creating General folder for shopping list categories');
        generalFolder = await createShoppingListFolder(db, {
          userId,
          name: 'General',
        });
      }
      
      targetParentId = generalFolder.id;
    }

    // Create the new category/subfolder
    logger.info({ itemName, categoryName: suggestedCategory, parentId: targetParentId, userId }, 'Creating new category for shopping list item');
    const newCategory = await createShoppingListFolder(db, {
      userId,
      parentId: targetParentId,
      name: suggestedCategory,
    });

    return newCategory.id;
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        itemName,
        userId,
      },
      'Failed to find or create category for shopping list item'
    );
    // Return undefined on error to allow item creation without category
    return undefined;
  }
}

