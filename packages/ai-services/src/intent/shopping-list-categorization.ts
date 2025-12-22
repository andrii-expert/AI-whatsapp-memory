import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { z } from 'zod';

const shoppingListCategorySchema = z.object({
  suggestedCategory: z.string().nullable().describe('The suggested category/subfolder name for this item. MUST be a SINGLE WORD only (e.g., "Fruits", "Dairy", "Vegetables", "Meat", "Beverages", "Snacks", "Cleaning", "Bakery", "Frozen", "Pantry", "Spices"). Do NOT use multiple words. Return a valid category name - only use null if you are absolutely certain no category fits.'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0-1) for the category suggestion'),
  reasoning: z.string().optional().describe('Brief reasoning for the category choice'),
});

export type ShoppingListCategoryResult = z.infer<typeof shoppingListCategorySchema>;

/**
 * Analyzes a shopping list item name and suggests an appropriate category/subfolder
 * @param itemName - The name of the shopping list item
 * @param existingCategories - Array of existing category names to avoid duplicates and suggest matching ones
 * @returns Suggested category name or null if no category is needed
 */
export async function suggestShoppingListCategory(
  itemName: string,
  existingCategories: string[] = []
): Promise<ShoppingListCategoryResult | null> {
  const startTime = Date.now();

  try {
    logger.info({ itemName, existingCategoriesCount: existingCategories.length }, 'Analyzing shopping list item for category');

    // Build the prompt
    const existingCategoriesText = existingCategories.length > 0
      ? `\n\nExisting categories: ${existingCategories.join(', ')}\nIf the item matches an existing category, use that exact name. Otherwise, suggest a new appropriate category.`
      : '\n\nNo existing categories yet. Suggest an appropriate new category if needed.';

    const prompt = `You are a shopping list categorization assistant. Analyze the shopping list item and suggest the most appropriate category/subfolder for it.

Shopping list item: "${itemName}"
${existingCategoriesText}

IMPORTANT: You MUST return a category suggestion. Only use null if the item is completely unclassifiable (very rare).

Categories MUST be:
- A SINGLE WORD ONLY (not multiple words, not phrases)
- Common grocery/shopping categories (e.g., Fruits, Vegetables, Dairy, Meat, Beverages, Snacks, Cleaning, Bakery, Frozen, Pantry, Spices, Beverages, etc.)
- Match existing category names exactly if applicable
- If you need to use a compound concept, use one word that best represents it (e.g., "Beverages" not "Drinks and Beverages")
- Be creative but reasonable - almost every shopping item fits into a category

Return a suggested category name (single word only). Only use null in extreme cases where no category makes sense.`;

    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: shoppingListCategorySchema,
      prompt: prompt,
    });

    const categoryResult = result.object as ShoppingListCategoryResult;
    const duration = Date.now() - startTime;

    logger.info(
      {
        durationMs: duration,
        itemName,
        suggestedCategory: categoryResult.suggestedCategory,
        confidence: categoryResult.confidence,
      },
      'Shopping list category analysis completed'
    );

    // Return null if category is null or empty, but allow lower confidence (0.3 instead of 0.5)
    // Lower threshold to be more permissive with suggestions
    if (!categoryResult.suggestedCategory || categoryResult.suggestedCategory.trim() === '') {
      logger.info({ itemName, confidence: categoryResult.confidence }, 'AI returned null or empty category');
      return null;
    }

    if (categoryResult.confidence < 0.3) {
      logger.info({ itemName, confidence: categoryResult.confidence }, 'AI confidence too low, rejecting suggestion');
      return null;
    }

    // Ensure the category is a single word (take first word if multiple words)
    const category = categoryResult.suggestedCategory.trim();
    const singleWordCategory = category.split(/\s+/)[0]; // Take only the first word
    
    if (singleWordCategory !== category) {
      logger.warn({ originalCategory: category, singleWordCategory, itemName }, 'AI returned multi-word category, using first word only');
    }

    return {
      ...categoryResult,
      suggestedCategory: singleWordCategory,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        durationMs: duration,
        itemName,
      },
      'Shopping list category analysis failed'
    );
    // Return null on error to allow item creation without category
    return null;
  }
}

