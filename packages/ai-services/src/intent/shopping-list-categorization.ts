import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { z } from 'zod';

const shoppingListCategorySchema = z.object({
  suggestedCategory: z.string().min(1).describe('The suggested category/subfolder name for this item. MUST be a SINGLE WORD only (e.g., "Fruits", "Dairy", "Vegetables", "Meat", "Beverages", "Snacks", "Cleaning", "Bakery", "Frozen", "Pantry", "Spices"). Do NOT use multiple words. You MUST always return a valid category name - never return null or empty string.'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0-1) for the category suggestion'),
  reasoning: z.string().optional().describe('Brief reasoning for the category choice'),
});

export type ShoppingListCategoryResult = z.infer<typeof shoppingListCategorySchema>;

/**
 * Fallback function to infer a basic category from item name if AI fails
 */
function inferBasicCategory(itemName: string): string | null {
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
    // Check for OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.error({}, 'OPENAI_API_KEY is not set in environment variables');
      throw new Error('OPENAI_API_KEY environment variable is required. Please set it in your environment.');
    }

    // Create OpenAI client with explicit API key
    const openaiClient = createOpenAI({
      apiKey: apiKey,
    });

    logger.info({ itemName, existingCategoriesCount: existingCategories.length }, 'Analyzing shopping list item for category');

    // Build the prompt
    const existingCategoriesText = existingCategories.length > 0
      ? `\n\nExisting categories: ${existingCategories.join(', ')}\nIf the item matches an existing category, use that exact name. Otherwise, suggest a new appropriate category.`
      : '\n\nNo existing categories yet. Suggest an appropriate new category if needed.';

    const prompt = `You are a shopping list categorization assistant. Analyze the shopping list item and suggest the most appropriate category/subfolder for it.

Shopping list item: "${itemName}"
${existingCategoriesText}

CRITICAL: You MUST ALWAYS return a valid category name. Never return null, empty string, or skip this. Every shopping item can be categorized.

Categories MUST be:
- A SINGLE WORD ONLY (not multiple words, not phrases)
- Common grocery/shopping categories (e.g., Fruits, Vegetables, Dairy, Meat, Beverages, Snacks, Cleaning, Bakery, Frozen, Pantry, Spices, Beverages, etc.)
- Match existing category names exactly if applicable
- If you need to use a compound concept, use one word that best represents it (e.g., "Beverages" not "Drinks and Beverages")
- Be creative but reasonable - almost every shopping item fits into a category
- If unsure, choose the most common/general category that fits (e.g., "Pantry" for general items, "Snacks" for snack items, "Cleaning" for cleaning products)

You MUST return a category name. Examples:
- "Milk" → "Dairy"
- "Apples" → "Fruits"  
- "Bread" → "Bakery"
- "Soap" → "Cleaning"
- "Water" → "Beverages"
- "Rice" → "Pantry"
- "Chips" → "Snacks"

Return a suggested category name (single word only). This field is REQUIRED and cannot be null or empty.`;

    logger.debug({ itemName, promptLength: prompt.length }, 'Calling OpenAI API for category suggestion');

    const result = await generateObject({
      model: openaiClient('gpt-4o-mini'),
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

    // Validate that we have a category (should always be present due to schema, but check anyway)
    if (!categoryResult.suggestedCategory || categoryResult.suggestedCategory.trim() === '') {
      logger.error({ itemName, confidence: categoryResult.confidence, result: categoryResult }, 'AI returned null or empty category despite schema requirement');
      // Fallback: try to infer a basic category from the item name
      const fallbackCategory = inferBasicCategory(itemName);
      if (fallbackCategory) {
        logger.warn({ itemName, fallbackCategory }, 'Using fallback category inference');
        return {
          suggestedCategory: fallbackCategory,
          confidence: 0.5,
        };
      }
      return null;
    }

    // Lower confidence threshold to 0.2 to be very permissive
    if (categoryResult.confidence < 0.2) {
      logger.warn({ itemName, confidence: categoryResult.confidence }, 'AI confidence very low, but using suggestion anyway');
      // Still return it, just log the warning
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
      'Shopping list category analysis failed, using fallback'
    );
    // Use fallback category inference instead of returning null
    const fallbackCategory = inferBasicCategory(itemName);
    if (fallbackCategory) {
      logger.info({ itemName, fallbackCategory }, 'Using fallback category after AI error');
      return {
        suggestedCategory: fallbackCategory,
        confidence: 0.5,
      };
    }
    // Last resort: return a generic category
    logger.warn({ itemName }, 'All category inference methods failed, using generic Pantry');
    return {
      suggestedCategory: 'Pantry',
      confidence: 0.3,
    };
  }
}

