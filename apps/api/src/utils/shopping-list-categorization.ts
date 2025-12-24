import type { Database } from '@imaginecalendar/database/client';
import { getUserShoppingListFolders, createShoppingListFolder } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';

/**
 * Fallback function to infer a basic category from item name if AI fails
 * This is a duplicate of the function in ai-services to ensure we always have a fallback
 */
function inferBasicCategory(itemName: string): string {
  const name = itemName.toLowerCase();
  
  // Basic keyword matching for comprehensive categories
  const categoryKeywords: Record<string, string[]> = {
    // Food & Consumables
    'Fruits': ['apple', 'banana', 'orange', 'grape', 'berry', 'fruit', 'mango', 'pineapple', 'peach', 'pear', 'kiwi', 'strawberry', 'blueberry'],
    'Vegetables': ['vegetable', 'carrot', 'lettuce', 'tomato', 'onion', 'potato', 'broccoli', 'spinach', 'cucumber', 'pepper', 'celery', 'cabbage'],
    'Grains': ['rice', 'pasta', 'flour', 'wheat', 'oat', 'quinoa', 'barley', 'cereal', 'bread', 'noodle'],
    'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'cake', 'cookie', 'pastry', 'donut', 'bagel', 'roll'],
    'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'dairy', 'cottage', 'sour cream', 'cream cheese'],
    'Meat': ['meat', 'beef', 'pork', 'lamb', 'sausage', 'bacon', 'hamburger', 'ground beef'],
    'Poultry': ['chicken', 'turkey', 'duck', 'egg', 'eggs'],
    'Seafood': ['fish', 'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'cod', 'tilapia'],
    'Frozen': ['frozen', 'ice', 'ice cream', 'frozen meal', 'frozen vegetable', 'frozen fruit'],
    'Snacks': ['chip', 'cracker', 'popcorn', 'nuts', 'snack', 'pretzel', 'granola'],
    'Beverages': ['water', 'juice', 'soda', 'coffee', 'tea', 'drink', 'beverage', 'beer', 'wine', 'alcohol'],
    'Spices': ['spice', 'herb', 'cumin', 'paprika', 'oregano', 'basil', 'thyme', 'rosemary'],
    'Condiments': ['ketchup', 'mustard', 'mayonnaise', 'sauce', 'oil', 'vinegar', 'soy sauce', 'hot sauce'],
    'Canned': ['can', 'canned', 'soup', 'tuna', 'bean', 'vegetable', 'fruit'],
    'Babyfood': ['baby', 'infant', 'formula', 'baby food', 'jarred baby food'],

    // Personal Care
    'Hygiene': ['soap', 'shampoo', 'body wash', 'body soap', 'hand soap'],
    'Toiletries': ['toothbrush', 'toothpaste', 'deodorant', 'mouthwash', 'floss'],
    'Skincare': ['cream', 'lotion', 'face wash', 'moisturizer', 'cleanser'],
    'Haircare': ['shampoo', 'conditioner', 'hair product', 'gel', 'spray'],
    'Cosmetics': ['makeup', 'foundation', 'lipstick', 'mascara', 'blush'],
    'Oralcare': ['toothpaste', 'mouthwash', 'dental floss', 'toothbrush'],

    // Cleaning & Household
    'Detergents': ['detergent', 'laundry', 'dish soap', 'dishwashing'],
    'Cleaners': ['cleaner', 'glass cleaner', 'floor cleaner', 'bathroom cleaner'],
    'Paperware': ['toilet paper', 'paper towel', 'napkin', 'tissue'],

    // Home & Living
    'Bedding': ['sheet', 'pillow', 'blanket', 'duvet', 'mattress'],
    'Linen': ['towel', 'curtain', 'tablecloth', 'napkin'],

    // Hardware & Tools
    'Tools': ['hammer', 'screwdriver', 'drill', 'wrench', 'pliers'],
    'Paint': ['paint', 'brush', 'roller', 'primer'],

    // Electronics & Technology
    'Phones': ['phone', 'mobile', 'cell phone', 'smartphone'],
    'Computers': ['laptop', 'computer', 'desktop', 'monitor'],
    'Accessories': ['charger', 'cable', 'case', 'headphone', 'earbud'],

    // Office & Stationery
    'Stationery': ['pen', 'pencil', 'notebook', 'paper', 'marker'],

    // Sports & Outdoors
    'Fitness': ['weight', 'dumbbell', 'yoga mat', 'resistance band', 'exercise'],
    'Camping': ['tent', 'sleeping bag', 'lantern', 'camping gear'],

    // Automotive
    'Automotive': ['oil', 'filter', 'tire', 'brake'],

    // Pets
    'Petfood': ['dog food', 'cat food', 'pet treat', 'dog treat', 'cat treat'],
    'Petcare': ['pet shampoo', 'pet brush', 'nail clipper'],

    // Baby & Kids
    'Babycare': ['diaper', 'wipe', 'baby lotion', 'baby powder'],
    'Feeding': ['bottle', 'pacifier', 'high chair', 'bib'],

    // Health & Medical
    'Pharmacy': ['medicine', 'vitamin', 'supplement', 'pill'],
    'Firstaid': ['bandage', 'antiseptic', 'thermometer', 'first aid'],

    // Miscellaneous
    'Gifts': ['card', 'gift', 'present', 'birthday', 'anniversary'],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => name.includes(keyword))) {
      return category;
    }
  }

  // Default to "Miscellaneous" for unknown items
  return 'Miscellaneous';
}

// Prioritized OpenAI service loading - always attempts to use AI first
async function getAISuggestionFunction() {
  try {
    // Always try to load AI services first - this is the primary method
    const aiServices = await import('@imaginecalendar/ai-services');
    if (aiServices && typeof aiServices.suggestShoppingListCategory === 'function') {
      logger.info('OpenAI services loaded successfully - using AI categorization');
      return aiServices.suggestShoppingListCategory;
    } else {
      logger.error({
        hasModule: !!aiServices,
        hasFunction: !!aiServices?.suggestShoppingListCategory,
        functionType: typeof aiServices?.suggestShoppingListCategory
      }, 'AI services module loaded but suggestShoppingListCategory is not a valid function');
      throw new Error('AI services function not available');
    }
  } catch (error) {
    // Only log as warning - we'll still try to use AI through other means
    logger.warn(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to load AI services module - attempting alternative loading method'
    );

    // As a last resort, try to access the function directly if it's already loaded
    try {
      const { suggestShoppingListCategory } = await import('@imaginecalendar/ai-services');
      if (typeof suggestShoppingListCategory === 'function') {
        logger.info('Alternative AI loading successful');
        return suggestShoppingListCategory;
      }
    } catch (fallbackError) {
      logger.error('All AI loading methods failed', { fallbackError });
    }

    // Only return null if all methods fail - this should be extremely rare
    return null;
  }
}

/**
 * Get AI category suggestion for a shopping list item
 * @param db - Database instance
 * @param userId - User ID
 * @param itemName - Name of the shopping list item
 * @param description - Optional description
 * @param parentFolderId - Optional parent folder ID to limit categories to that folder
 * @returns Suggested category name and confidence, or null if no suggestion
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

    // Prioritize OpenAI analysis - this is the primary categorization method
    const suggestShoppingListCategory = await getAISuggestionFunction();

    if (!suggestShoppingListCategory) {
      logger.error({ itemName, userId }, 'CRITICAL: AI services completely unavailable - this should not happen in production');
      // Only use fallback as absolute last resort
      const fallbackCategory = inferBasicCategory(itemName);
      logger.warn({ itemName, userId, fallbackCategory }, 'Using emergency fallback categorization - OpenAI analysis failed');
      return { suggestedCategory: fallbackCategory, confidence: 0.3 };
    }

    logger.info({ itemName, userId }, 'Using OpenAI for categorization analysis');

    logger.info({ itemName, userId, itemText, existingCategoriesCount: existingCategories.length }, 'Calling AI for category suggestion');

    // Attempt AI categorization with retry logic
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries && !categoryResult) {
      try {
        logger.info({
          itemName,
          userId,
          attempt: retryCount + 1,
          maxRetries: maxRetries + 1
        }, 'Attempting OpenAI categorization');

        // Add timeout to prevent long-running AI calls from blocking the request
        const timeoutPromise = new Promise<null>((resolve) => {
          const timeoutMs = 15000; // 15 second timeout for AI processing
          setTimeout(() => {
            logger.warn({ itemName, userId, attempt: retryCount + 1 }, `AI categorization timed out after ${timeoutMs}ms`);
            resolve(null);
          }, timeoutMs);
        });

        const aiPromise = suggestShoppingListCategory(itemText, existingCategories);

        categoryResult = await Promise.race([
          aiPromise,
          timeoutPromise,
        ]);

        if (categoryResult) {
          logger.info({
            itemName,
            userId,
            suggestedCategory: categoryResult.suggestedCategory,
            confidence: categoryResult.confidence,
            attempt: retryCount + 1
          }, 'OpenAI categorization successful');
          break; // Success, exit retry loop
        } else if (retryCount < maxRetries) {
          logger.warn({
            itemName,
            userId,
            attempt: retryCount + 1
          }, 'AI categorization returned null, will retry');
          retryCount++;
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            itemName,
            userId,
            attempt: retryCount + 1,
          },
          'AI categorization failed with exception, will retry if attempts remaining'
        );

        if (retryCount < maxRetries) {
          retryCount++;
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          logger.error({
            itemName,
            userId,
            totalAttempts: maxRetries + 1
          }, 'All AI categorization attempts failed');
          break;
        }
      }
    }

    if (!categoryResult) {
      logger.error({
        itemName,
        userId,
        totalAttempts: maxRetries + 1
      }, 'CRITICAL: All OpenAI categorization attempts failed - using emergency fallback');
      // Emergency fallback - this should be extremely rare
      const fallbackCategory = inferBasicCategory(itemName);
      return {
        suggestedCategory: fallbackCategory,
        confidence: 0.1,
        emergencyFallback: true
      };
    }

    if (!categoryResult.suggestedCategory) {
      logger.error({
        itemName,
        userId,
        confidence: categoryResult.confidence,
        hasSuggestedCategory: !!categoryResult.suggestedCategory
      }, 'CRITICAL: OpenAI returned result but no category - using emergency fallback');
      // Emergency fallback - AI succeeded but returned invalid data
      const fallbackCategory = inferBasicCategory(itemName);
      return {
        suggestedCategory: fallbackCategory,
        confidence: 0.1,
        emergencyFallback: true
      };
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
    // Validate inputs
    if (!itemName || !itemName.trim()) {
      logger.warn({ userId, itemName }, 'Invalid item name provided for category creation');
      return undefined;
    }

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

    // Use AI to suggest a category with retry logic
    const suggestShoppingListCategoryFn = await getAISuggestionFunction();

    if (!suggestShoppingListCategoryFn) {
      logger.error({ itemName, userId }, 'CRITICAL: AI services unavailable for folder creation');
      return undefined;
    }

    // Attempt AI categorization with retry logic for folder creation
    let categoryResult = null;
    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries && !categoryResult) {
      try {
        logger.info({
          itemName,
          userId,
          attempt: retryCount + 1,
          maxRetries: maxRetries + 1
        }, 'Attempting OpenAI categorization for folder creation');

        const timeoutPromise = new Promise<null>((resolve) => {
          const timeoutMs = 15000;
          setTimeout(() => {
            logger.warn({ itemName, userId, attempt: retryCount + 1 }, `AI categorization for folder creation timed out after ${timeoutMs}ms`);
            resolve(null);
          }, timeoutMs);
        });

        const aiPromise = suggestShoppingListCategoryFn(itemName, existingCategories);

        categoryResult = await Promise.race([
          aiPromise,
          timeoutPromise,
        ]);

        if (categoryResult) {
          logger.info({
            itemName,
            userId,
            suggestedCategory: categoryResult.suggestedCategory,
            confidence: categoryResult.confidence,
            attempt: retryCount + 1
          }, 'OpenAI categorization successful for folder creation');
          break;
        } else if (retryCount < maxRetries) {
          logger.warn({
            itemName,
            userId,
            attempt: retryCount + 1
          }, 'AI categorization for folder creation returned null, will retry');
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            itemName,
            userId,
            attempt: retryCount + 1,
          },
          'AI categorization for folder creation failed with exception, will retry if attempts remaining'
        );

        if (retryCount < maxRetries) {
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          logger.error({
            itemName,
            userId,
            totalAttempts: maxRetries + 1
          }, 'All AI categorization attempts failed for folder creation');
          break;
        }
      }
    }

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
        try {
          logger.info({ userId }, 'Creating General folder for shopping list categories');
          generalFolder = await createShoppingListFolder(db, {
            userId,
            name: 'General',
          });
          
          if (!generalFolder || !generalFolder.id) {
            logger.error({ userId }, 'Failed to create General folder - no ID returned');
            return undefined;
          }
        } catch (generalError) {
          logger.error(
            {
              error: generalError instanceof Error ? generalError.message : String(generalError),
              userId,
            },
            'Failed to create General folder'
          );
          return undefined;
        }
      }
      
      targetParentId = generalFolder.id;
    }

    // Create the new category/subfolder
    logger.info({ itemName, categoryName: suggestedCategory, parentId: targetParentId, userId }, 'Creating new category for shopping list item');
    
    try {
      const newCategory = await createShoppingListFolder(db, {
        userId,
        parentId: targetParentId,
        name: suggestedCategory,
      });

      if (!newCategory || !newCategory.id) {
        logger.error({ itemName, categoryName: suggestedCategory, parentId: targetParentId, userId }, 'Failed to create category folder - no ID returned');
        return undefined;
      }

      return newCategory.id;
    } catch (createError) {
      logger.error(
        {
          error: createError instanceof Error ? createError.message : String(createError),
          itemName,
          categoryName: suggestedCategory,
          parentId: targetParentId,
          userId,
        },
        'Failed to create category folder'
      );
      return undefined;
    }
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

