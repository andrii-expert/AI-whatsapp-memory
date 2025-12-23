import type { Database } from '@imaginecalendar/database/client';
import { getUserShoppingListFolders, createShoppingListFolder } from '@imaginecalendar/database/queries';
import { suggestShoppingListCategory } from '@imaginecalendar/ai-services';
import { logger } from '@imaginecalendar/logger';

/**
 * Fallback function to infer a basic category from item name if AI fails
 */
function inferBasicCategory(itemName: string): string {
  const name = itemName.toLowerCase();
  
  // Basic keyword matching for common categories
  const categoryKeywords: Record<string, string[]> = {
    'Fruits': ['apple', 'banana', 'orange', 'grape', 'berry', 'fruit', 'mango', 'pineapple', 'peach', 'pear'],
    'Vegetables': ['vegetable', 'carrot', 'lettuce', 'tomato', 'onion', 'potato', 'broccoli', 'spinach', 'cucumber'],
    'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'dairy'],
    'Meat': ['meat', 'chicken', 'beef', 'pork', 'fish', 'turkey', 'lamb', 'sausage', 'bacon'],
    'Beverages': ['water', 'juice', 'soda', 'coffee', 'tea', 'drink', 'beverage', 'beer', 'wine'],
    'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'cake', 'cookie', 'pastry', 'donut'],
    'Snacks': ['chip', 'cracker', 'popcorn', 'nuts', 'snack', 'candy', 'chocolate'],
    'Cleaning': ['soap', 'detergent', 'cleaner', 'bleach', 'sponge', 'towel', 'paper'],
    'Frozen': ['frozen', 'ice', 'ice cream'],
    'Pantry': ['rice', 'pasta', 'flour', 'sugar', 'salt', 'spice', 'oil', 'vinegar'],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category;
    }
  }

  // Default to "Pantry" for unknown items
  return 'Pantry';
}

/**
 * Get AI category suggestion for a shopping list item
 */
export async function getCategorySuggestion(
  db: Database,
  userId: string,
  itemName: string,
  description?: string,
  folderId?: string
): Promise<{ suggestedCategory: string | null; confidence?: number }> {
  try {
    // Validate inputs
    const itemText = description ? `${itemName} ${description}`.trim() : itemName;
    if (!itemText || !itemText.trim()) {
      logger.warn({ itemName, description }, 'Empty item text, using fallback');
      const fallbackCategory = inferBasicCategory(itemName || 'Item');
      return { suggestedCategory: fallbackCategory, confidence: 0.5 };
    }

    // Get existing categories from items in the folder (or all items if no folder)
    const { getUserShoppingListItems } = await import('@imaginecalendar/database/queries');
    const items = await getUserShoppingListItems(db, userId, {
      folderId: folderId,
    });
    
    // Extract unique categories from items
    const existingCategories = Array.from(
      new Set(
        items
          .map((item: any) => item.category)
          .filter((cat): cat is string => !!cat)
          .map((cat) => cat.toLowerCase())
      )
    );

    // Use AI to suggest a category with timeout protection
    let categoryResult: any = null;
    
    try {
      // Add timeout to prevent long-running AI calls from blocking the request
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          logger.warn({ itemName, userId }, 'AI category suggestion timed out after 8 seconds');
          resolve(null);
        }, 8000); // 8 second timeout
      });
      
      const aiPromise = suggestShoppingListCategory(itemText, existingCategories);
      
      categoryResult = await Promise.race([
        aiPromise,
        timeoutPromise,
      ]);

      logger.info({ 
        itemName, 
        userId, 
        hasResult: !!categoryResult,
        suggestedCategory: categoryResult?.suggestedCategory,
        confidence: categoryResult?.confidence 
      }, 'AI category suggestion result');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          itemName,
          userId,
          itemText,
        },
        'AI category suggestion failed with exception'
      );
      categoryResult = null;
    }

    if (!categoryResult) {
      logger.warn({ itemName, userId }, 'AI returned null result, using fallback');
      const fallbackCategory = inferBasicCategory(itemName);
      return { suggestedCategory: fallbackCategory, confidence: 0.5 };
    }

    if (!categoryResult.suggestedCategory) {
      logger.warn({ 
        itemName, 
        userId, 
        confidence: categoryResult.confidence,
        hasSuggestedCategory: !!categoryResult.suggestedCategory 
      }, 'AI result has no suggestedCategory, using fallback');
      const fallbackCategory = inferBasicCategory(itemName);
      return { suggestedCategory: fallbackCategory, confidence: 0.5 };
    }

    logger.info({ 
      itemName, 
      userId, 
      suggestedCategory: categoryResult.suggestedCategory,
      confidence: categoryResult.confidence 
    }, 'AI category suggestion successful');

    return {
      suggestedCategory: categoryResult.suggestedCategory,
      confidence: categoryResult.confidence,
    };
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        itemName,
        userId,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to get category suggestion, using fallback'
    );
    const fallbackCategory = inferBasicCategory(itemName);
    return { suggestedCategory: fallbackCategory, confidence: 0.5 };
  }
}

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
            // Also check nested subfolders
            if (subfolder.subfolders && subfolder.subfolders.length > 0) {
              categories.push(...extractCategories([subfolder]));
            }
          }
        }
      }
      return categories;
    };

    // If parentFolderId is provided, only extract categories from that parent folder
    // Otherwise, extract from all folders
    let existingCategories: string[];
    if (parentFolderId) {
      const parentFolder = findFolderById(allFolders, parentFolderId);
      if (parentFolder && parentFolder.subfolders) {
        existingCategories = extractCategories([parentFolder]);
      } else {
        existingCategories = [];
      }
    } else {
      existingCategories = extractCategories(allFolders);
    }

    // Use AI to suggest a category
    const categoryResult = await suggestShoppingListCategory(itemName, existingCategories);

    if (!categoryResult || !categoryResult.suggestedCategory) {
      logger.info({ itemName, userId }, 'No category suggested for shopping list item');
      return undefined;
    }

    const suggestedCategory = categoryResult.suggestedCategory.trim();

    // Find existing category (case-insensitive)
    const findCategoryInFolders = (folders: any[], categoryName: string, parentId?: string): string | null => {
      // If parentFolderId is specified, only search within that parent folder's subfolders
      if (parentId) {
        const parentFolder = findFolderById(allFolders, parentId);
        if (!parentFolder) {
          logger.warn({ parentId, userId }, 'Parent folder not found for category search');
          return null;
        }
        
        // Search only within the parent folder's subfolders
        if (parentFolder.subfolders && parentFolder.subfolders.length > 0) {
          for (const subfolder of parentFolder.subfolders) {
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
        return null;
      }

      // No parent specified, search all folders
      for (const folder of folders) {
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

    if (targetParentId) {
      // Verify that the parent folder exists and is accessible
      const parentFolder = findFolderById(allFolders, targetParentId);
      if (!parentFolder) {
        logger.warn({ parentId: targetParentId, userId, itemName }, 'Parent folder not found or not accessible, falling back to General folder');
        targetParentId = undefined; // Fall back to General folder
      }
    }

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

