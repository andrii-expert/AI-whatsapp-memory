import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { z } from 'zod';

const shoppingListCategorySchema = z.object({
  suggestedCategory: z.string().describe('The suggested category/subfolder name for this item. Should be a single word or short phrase (e.g., "Fruits", "Dairy", "Vegetables", "Meat", "Beverages", "Snacks", "Cleaning", "Personal Care", "Bakery", "Frozen"). Use null if no specific category is needed.'),
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

Categories should be:
- Single words or short phrases (1-2 words preferred)
- Common grocery/shopping categories (e.g., Fruits, Vegetables, Dairy, Meat, Beverages, Snacks, Cleaning, Personal Care, Bakery, Frozen, Pantry, Spices, etc.)
- Use null if the item is too generic or doesn't fit into a clear category
- Match existing category names exactly if applicable

Return a suggested category name or null if no category is needed.`;

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

    // Return null if confidence is too low or category is null
    if (!categoryResult.suggestedCategory || categoryResult.confidence < 0.5) {
      return null;
    }

    return categoryResult;
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

