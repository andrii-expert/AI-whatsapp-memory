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

    const prompt = `You are a shopping list categorization assistant. Analyze the shopping list item and suggest the most appropriate category/subfolder for it.

Shopping list item: "${itemName}"
${existingCategoriesText}

CRITICAL: You MUST ALWAYS return a valid category name. Never return null, empty string, or skip this. Every shopping item can be categorized.

Use these comprehensive categories for better organization:

FOOD & CONSUMABLES:
  • Produce: Fruits, Vegetables, Grains, Cereals
  • Bakery: Bread, Pastries, Cakes
  • Dairy: Milk, Cheese, Yogurt, Butter, Eggs
  • Meat: Beef, Pork, Lamb
  • Poultry: Chicken, Turkey, Duck
  • Seafood: Fish, Shrimp, Crab, Lobster
  • Deli: Cold cuts, Cheese, Prepared foods
  • Frozen: Frozen meals, Ice cream, Vegetables
  • Snacks: Chips, Nuts, Popcorn
  • Confectionery: Sweets, Chocolate, Biscuits, Candy
  • Beverages: Juice, Soda, Water, Coffee, Tea, Alcohol
  • Spices: Herbs, Spices, Seasonings
  • Condiments: Sauces, Oils, Vinegar, Ketchup, Mustard
  • Canned: Soups, Vegetables, Fruits, Tuna
  • Preserves: Jams, Jellies, Pickles
  • Babyfood: Infant formula, Baby food
  • Petfood: Dog food, Cat food, Pet treats

PERSONAL CARE:
  • Hygiene: Soap, Shampoo, Body wash
  • Toiletries: Toothbrush, Toothpaste, Deodorant
  • Skincare: Creams, Lotions, Face wash
  • Haircare: Shampoo, Conditioner, Hair products
  • Cosmetics: Makeup, Foundation, Lipstick
  • Fragrance: Perfume, Cologne, Body spray
  • Oralcare: Toothpaste, Mouthwash, Dental floss
  • Sanitary: Feminine products, Diapers
  • Grooming: Razors, Shaving cream, Hair clippers

CLEANING & HOUSEHOLD:
  • Detergents: Laundry detergent, Dish soap
  • Cleaners: All-purpose cleaner, Glass cleaner
  • Disinfectants: Bleach, Disinfectant sprays
  • Paperware: Toilet paper, Paper towels, Napkins
  • Storage: Containers, Bags, Wraps
  • Cookware: Pots, Pans, Baking sheets
  • Utensils: Knives, Spoons, Whisks
  • Tableware: Plates, Bowls, Glasses

CLOTHING & ACCESSORIES:
  • Apparel: Tops, Bottoms, Underwear, Sleepwear
  • Outerwear: Jackets, Coats, Sweaters
  • Footwear: Shoes, Socks, Boots
  • Accessories: Belts, Hats, Scarves, Jewelry
  • Bags: Handbags, Backpacks, Wallets

HOME & LIVING:
  • Furniture: Chairs, Tables, Beds
  • Bedding: Sheets, Pillows, Blankets
  • Linen: Towels, Curtains, Tablecloths
  • Decor: Candles, Clocks, Mirrors, Plants
  • Lighting: Lamps, Light bulbs

HARDWARE & TOOLS:
  • Tools: Hammers, Screwdrivers, Drills
  • Fasteners: Nails, Screws, Bolts
  • Plumbing: Pipes, Fittings, Sealants
  • Electrical: Wires, Outlets, Light fixtures
  • Paint: Paint, Brushes, Rollers
  • Safety: Gloves, Goggles, First aid

ELECTRONICS & TECHNOLOGY:
  • Electronics: TVs, Radios, Calculators
  • Computers: Laptops, Desktops, Monitors
  • Phones: Mobile phones, Accessories
  • Audio: Headphones, Speakers, Microphones
  • Gaming: Consoles, Controllers, Games
  • Accessories: Chargers, Cables, Cases

OFFICE & STATIONERY:
  • Stationery: Pens, Pencils, Notebooks
  • Paper: Printer paper, Notebooks, Cards
  • Officeware: Staplers, Tape, Clips
  • Printing: Ink, Toner, Labels

ENTERTAINMENT & LEISURE:
  • Toys: Action figures, Dolls, Building sets
  • Games: Board games, Card games, Puzzles
  • Books: Novels, Textbooks, Magazines
  • Music: CDs, Vinyl, Instruments
  • Movies: DVDs, Blu-rays
  • Hobbies: Crafts, Photography, Sports

SPORTS & OUTDOORS:
  • Sportswear: Jerseys, Shorts, Socks
  • Equipment: Balls, Bats, Rackets
  • Fitness: Weights, Yoga mats, Resistance bands
  • Camping: Tents, Sleeping bags, Lanterns
  • Cycling: Bikes, Helmets, Locks
  • Fishing: Rods, Reels, Tackle

AUTOMOTIVE:
  • Automotive: Oil, Filters, Belts
  • Accessories: Phone mounts, Organizers
  • Carcare: Wax, Cleaners, Tire shine

PETS:
  • Petcare: Shampoo, Brushes, Nail clippers
  • Petfood: Dry food, Wet food, Treats
  • Toys: Chew toys, Balls, Plush toys

BABY & KIDS:
  • Babycare: Diapers, Wipes, Lotion
  • Feeding: Bottles, Pacifiers, High chairs
  • Toys: Rattles, Blocks, Educational toys
  • Clothing: Onesies, Socks, Hats

HEALTH & MEDICAL:
  • Pharmacy: Medicines, Vitamins, Supplements
  • Firstaid: Bandages, Antiseptics, Thermometers
  • Wellness: Essential oils, Aromatherapy

MISCELLANEOUS:
  • Gifts: Cards, Wrapping paper, Gift bags
  • Seasonal: Holiday decorations, Party supplies
  • Party: Balloons, Streamers, Tableware

Categories MUST be:
- A SINGLE WORD ONLY (not multiple words, not phrases)
- Match existing category names exactly if applicable
- Choose from the comprehensive list above
- If unsure, choose the most specific category that fits
- If the item doesn't fit any category, use "Miscellaneous"

You MUST return a category name. Examples:
- "Milk" → "Dairy"
- "Apples" → "Fruits"
- "Bread" → "Bakery"
- "Soap" → "Hygiene"
- "Water" → "Beverages"
- "Rice" → "Grains"
- "Chips" → "Snacks"
- "Face cream" → "Skincare"
- "Yoga mat" → "Fitness"
- "Baby formula" → "Babyfood"
- "Wall paint" → "Paint"
- "Wireless charger" → "Accessories"

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

