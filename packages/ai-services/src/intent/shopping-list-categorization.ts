import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { logger } from '@imaginecalendar/logger';
import { z } from 'zod';

const shoppingListCategorySchema = z.object({
  suggestedCategory: z.enum([
    // Food & Consumables
    'Fruits', 'Vegetables', 'Grains', 'Bakery', 'Dairy', 'Meat', 'Poultry', 'Seafood', 'Deli', 'Frozen', 'Snacks', 'Confectionery', 'Beverages', 'Spices', 'Condiments', 'Canned', 'Preserves', 'Babyfood', 'Petfood',
    // Personal Care
    'Hygiene', 'Toiletries', 'Skincare', 'Haircare', 'Cosmetics', 'Fragrance', 'Oralcare', 'Sanitary', 'Grooming',
    // Cleaning & Household
    'Detergents', 'Cleaners', 'Disinfectants', 'Paperware', 'Storage', 'Cookware', 'Utensils', 'Tableware',
    // Clothing & Accessories
    'Apparel', 'Outerwear', 'Footwear', 'Accessories', 'Bags',
    // Home & Living
    'Furniture', 'Bedding', 'Linen', 'Decor', 'Lighting',
    // Hardware & Tools
    'Tools', 'Fasteners', 'Plumbing', 'Electrical', 'Paint', 'Safety',
    // Electronics & Technology
    'Electronics', 'Computers', 'Phones', 'Audio', 'Gaming', 'Accessories',
    // Office & Stationery
    'Stationery', 'Paper', 'Officeware', 'Printing',
    // Entertainment & Leisure
    'Toys', 'Games', 'Books', 'Music', 'Movies', 'Hobbies',
    // Sports & Outdoors
    'Sportswear', 'Equipment', 'Fitness', 'Camping', 'Cycling', 'Fishing',
    // Automotive
    'Automotive', 'Carcare',
    // Pets
    'Petcare', 'Petfood',
    // Baby & Kids
    'Babycare', 'Feeding',
    // Health & Medical
    'Pharmacy', 'Firstaid', 'Wellness',
    // Miscellaneous
    'Gifts', 'Seasonal', 'Party', 'Miscellaneous'
  ]).describe('The suggested category name from the predefined list. Choose the single most appropriate category for this shopping item.'),
  confidence: z.number().min(0).max(1).describe('Confidence score (0-1) for the category suggestion. Use 0.9+ for obvious matches, 0.7-0.8 for good matches, 0.5-0.6 for reasonable matches, below 0.5 for uncertain matches.'),
  reasoning: z.string().optional().describe('Brief reasoning for why this category was chosen'),
});

export type ShoppingListCategoryResult = z.infer<typeof shoppingListCategorySchema>;

/**
 * Fallback function to infer a basic category from item name if AI fails
 */
function inferBasicCategory(itemName: string): string | null {
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

    const prompt = `You are a professional shopping list categorization AI. Analyze this shopping item and return the most appropriate category.

ITEM: "${itemName}"
${existingCategoriesText}

INSTRUCTIONS:
- Choose ONE category from the predefined list that best fits this item
- Be specific: prefer detailed categories over general ones
- Consider the item's primary purpose and typical store location
- If uncertain between multiple categories, choose the most specific one

CATEGORY LIST:
Food: Fruits, Vegetables, Grains, Bakery, Dairy, Meat, Poultry, Seafood, Deli, Frozen, Snacks, Confectionery, Beverages, Spices, Condiments, Canned, Preserves, Babyfood, Petfood
Personal Care: Hygiene, Toiletries, Skincare, Haircare, Cosmetics, Fragrance, Oralcare, Sanitary, Grooming
Home: Detergents, Cleaners, Disinfectants, Paperware, Storage, Cookware, Utensils, Tableware, Furniture, Bedding, Linen, Decor, Lighting
Clothing: Apparel, Outerwear, Footwear, Accessories, Bags
Tools: Tools, Fasteners, Plumbing, Electrical, Paint, Safety
Electronics: Electronics, Computers, Phones, Audio, Gaming
Office: Stationery, Paper, Officeware, Printing
Entertainment: Toys, Games, Books, Music, Movies, Hobbies
Sports: Sportswear, Equipment, Fitness, Camping, Cycling, Fishing
Automotive: Automotive, Carcare
Pets: Petcare, Petfood
Baby: Babycare, Feeding
Health: Pharmacy, Firstaid, Wellness
Other: Gifts, Seasonal, Party, Miscellaneous

EXAMPLES:
- "Milk" → Dairy (not Beverages)
- "Apples" → Fruits (not Produce)
- "Toothbrush" → Oralcare (not Hygiene)
- "Yoga mat" → Fitness (not Sports)
- "Baby formula" → Babyfood (not Babycare)
- "Wall paint" → Paint (not Tools)
- "Wireless charger" → Accessories (not Electronics)

Choose the single most appropriate category for this item.`;

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
          confidence: 0.6, // Higher confidence for fallback
        };
      }
      return null;
    }

    // Use reasonable confidence threshold - AI should be quite good with the enum constraint
    if (categoryResult.confidence < 0.3) {
      logger.warn({ itemName, confidence: categoryResult.confidence, category: categoryResult.suggestedCategory }, 'AI confidence below threshold, using fallback');
      const fallbackCategory = inferBasicCategory(itemName);
      if (fallbackCategory) {
        return {
          suggestedCategory: fallbackCategory,
          confidence: 0.5,
        };
      }
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

