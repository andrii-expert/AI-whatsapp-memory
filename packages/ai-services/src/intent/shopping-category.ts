import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';

/**
 * Analyze a shopping item name and suggest an appropriate category
 * Returns a category name like "Dairy", "Produce", "Meat", etc.
 */
export async function suggestShoppingCategory(itemName: string): Promise<string | null> {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      logger.warn({}, 'OPENAI_API_KEY not set, cannot suggest category');
      return null;
    }

    const openaiClient = createOpenAI({ apiKey });
    const model = openaiClient('gpt-4o-mini');

    const prompt = `You are a shopping list categorization assistant. Analyze the shopping item name and suggest the most appropriate category.

Common shopping categories:
- Dairy (milk, cheese, yogurt, butter, cream, eggs)
- Produce (fruits, vegetables, fresh produce)
- Meat (chicken, beef, pork, lamb, fish, seafood)
- Beverages (juice, soda, water, coffee, tea, alcohol)
- Bakery (bread, pastries, bagels, rolls)
- Frozen (frozen foods, ice cream, frozen vegetables)
- Pantry (rice, pasta, canned goods, spices, condiments)
- Personal Care (toilet paper, soap, shampoo, toothpaste, deodorant)
- Household (cleaning supplies, paper towels, trash bags)
- Snacks (chips, crackers, cookies, candy)
- Health (vitamins, medicine, first aid)
- Baby (baby food, diapers, baby care items)
- Pet (pet food, pet supplies)
- Other (items that don't fit other categories)

Item name: "${itemName}"

Respond with ONLY the category name (e.g., "Dairy", "Produce", "Meat"). Do not include any explanation or additional text. If the item doesn't clearly fit any category, respond with "Other".`;

    const result = await generateText({
      model,
      prompt,
      temperature: 0.1, // Low temperature for consistent categorization
      maxTokens: 20,
    });

    const category = result.text.trim();
    
    // Validate the category is one of the expected ones
    const validCategories = [
      'Dairy', 'Produce', 'Meat', 'Beverages', 'Bakery', 'Frozen',
      'Pantry', 'Personal Care', 'Household', 'Snacks', 'Health',
      'Baby', 'Pet', 'Other'
    ];
    
    const normalizedCategory = validCategories.find(
      cat => cat.toLowerCase() === category.toLowerCase()
    ) || 'Other';

    logger.debug(
      { itemName, suggestedCategory: normalizedCategory },
      'Category suggested for shopping item'
    );

    return normalizedCategory;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error), itemName },
      'Failed to suggest shopping category'
    );
    return null;
  }
}

