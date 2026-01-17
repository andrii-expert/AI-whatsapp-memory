import { NextRequest, NextResponse } from "next/server";

/**
 * Query Wikidata API for product information
 * Searches for items that are products, food items, consumer goods, or related categories
 */
async function searchWikidata(query: string): Promise<Array<{ name: string; category?: string }>> {
  try {
    // Sanitize query for SPARQL (escape special characters)
    const sanitizedQuery = query.replace(/['"\\]/g, '');
    
    // Wikidata SPARQL endpoint - search for products, food items, consumer goods
    const sparqlQuery = `
      SELECT DISTINCT ?item ?itemLabel ?categoryLabel WHERE {
        {
          # Search for products
          ?item wdt:P31/wdt:P279* wd:Q28877 .  # Instance of or subclass of "product"
        } UNION {
          # Search for food items
          ?item wdt:P31/wdt:P279* wd:Q2095 .  # Instance of or subclass of "food"
        } UNION {
          # Search for consumer goods
          ?item wdt:P31/wdt:P279* wd:Q33506 .  # Instance of or subclass of "consumer good"
        } UNION {
          # Search for beverages
          ?item wdt:P31/wdt:P279* wd:Q40050 .  # Instance of or subclass of "beverage"
        }
        
        ?item rdfs:label ?itemLabel .
        FILTER(LANG(?itemLabel) = "en") .
        FILTER(CONTAINS(LCASE(?itemLabel), LCASE("${sanitizedQuery}"))) .
        
        OPTIONAL {
          ?item wdt:P31 ?category .
          ?category rdfs:label ?categoryLabel .
          FILTER(LANG(?categoryLabel) = "en") .
          FILTER(?category != wd:Q28877 && ?category != wd:Q2095 && ?category != wd:Q33506 && ?category != wd:Q40050)
        }
      }
      LIMIT 20
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;
    
    // Add timeout to prevent hanging (5 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WhatsApp-Shopping-List/1.0'
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Wikidata API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results: Array<{ name: string; category?: string }> = [];

    if (data.results?.bindings) {
      for (const binding of data.results.bindings) {
        const name = binding.itemLabel?.value;
        const category = binding.categoryLabel?.value;
        
        if (name && name.toLowerCase().includes(query.toLowerCase())) {
          // Normalize category name
          const normalizedCategory = category 
            ? category.replace(/^[a-z]/, (char: string) => char.toUpperCase())
            : undefined;
          
          results.push({
            name: name,
            category: normalizedCategory
          });
        }
      }
    }

    return results;
  } catch (error) {
    // Silently fail - we'll use local database as fallback
    if (error instanceof Error) {
      // Ignore timeout/abort errors, log others
      if (error.name !== 'AbortError' && !error.message.includes('aborted')) {
        console.error("Error querying Wikidata:", error);
      }
    }
    return [];
  }
}

// Common shopping/product items database for autocomplete
// This serves as a fallback and initial database
const PRODUCT_DATABASE: Array<{ name: string; category: string; aliases?: string[] }> = [
  // Dairy
  { name: "Milk", category: "Dairy", aliases: ["Whole Milk", "2% Milk", "Skim Milk", "Almond Milk", "Soy Milk"] },
  { name: "Cheese", category: "Dairy", aliases: ["Cheddar", "Mozzarella", "Swiss", "American Cheese"] },
  { name: "Butter", category: "Dairy" },
  { name: "Yogurt", category: "Dairy", aliases: ["Greek Yogurt", "Plain Yogurt"] },
  { name: "Eggs", category: "Dairy", aliases: ["Large Eggs", "Egg Carton"] },
  { name: "Cream", category: "Dairy", aliases: ["Heavy Cream", "Whipping Cream"] },
  
  // Produce
  { name: "Bananas", category: "Produce", aliases: ["Banana"] },
  { name: "Apples", category: "Produce", aliases: ["Apple", "Red Apples", "Green Apples"] },
  { name: "Oranges", category: "Produce", aliases: ["Orange"] },
  { name: "Tomatoes", category: "Produce", aliases: ["Tomato", "Cherry Tomatoes"] },
  { name: "Lettuce", category: "Produce", aliases: ["Iceberg Lettuce", "Romaine Lettuce"] },
  { name: "Carrots", category: "Produce", aliases: ["Carrot", "Baby Carrots"] },
  { name: "Onions", category: "Produce", aliases: ["Onion", "Yellow Onions", "Red Onions"] },
  { name: "Potatoes", category: "Produce", aliases: ["Potato", "Russet Potatoes", "Sweet Potatoes"] },
  { name: "Broccoli", category: "Produce" },
  { name: "Spinach", category: "Produce" },
  { name: "Avocado", category: "Produce", aliases: ["Avocados"] },
  { name: "Strawberries", category: "Produce", aliases: ["Strawberry"] },
  { name: "Grapes", category: "Produce", aliases: ["Grape"] },
  
  // Meat & Seafood
  { name: "Chicken Breast", category: "Meat", aliases: ["Chicken", "Boneless Chicken"] },
  { name: "Ground Beef", category: "Meat", aliases: ["Beef", "Hamburger Meat"] },
  { name: "Salmon", category: "Seafood", aliases: ["Salmon Fillet"] },
  { name: "Shrimp", category: "Seafood", aliases: ["Shrimps"] },
  { name: "Bacon", category: "Meat" },
  { name: "Sausage", category: "Meat", aliases: ["Italian Sausage", "Breakfast Sausage"] },
  
  // Bakery
  { name: "Bread", category: "Bakery", aliases: ["White Bread", "Wheat Bread", "Sourdough"] },
  { name: "Bagels", category: "Bakery", aliases: ["Bagel"] },
  { name: "Croissants", category: "Bakery", aliases: ["Croissant"] },
  
  // Pantry
  { name: "Rice", category: "Pantry", aliases: ["White Rice", "Brown Rice"] },
  { name: "Pasta", category: "Pantry", aliases: ["Spaghetti", "Penne", "Macaroni"] },
  { name: "Flour", category: "Pantry", aliases: ["All Purpose Flour", "Wheat Flour"] },
  { name: "Sugar", category: "Pantry", aliases: ["White Sugar", "Brown Sugar"] },
  { name: "Salt", category: "Pantry", aliases: ["Table Salt", "Sea Salt"] },
  { name: "Pepper", category: "Pantry", aliases: ["Black Pepper"] },
  { name: "Olive Oil", category: "Pantry", aliases: ["Extra Virgin Olive Oil"] },
  { name: "Vegetable Oil", category: "Pantry" },
  { name: "Vinegar", category: "Pantry", aliases: ["Balsamic Vinegar", "Apple Cider Vinegar"] },
  
  // Canned Goods
  { name: "Tomato Sauce", category: "Canned Goods", aliases: ["Pasta Sauce", "Marinara Sauce"] },
  { name: "Beans", category: "Canned Goods", aliases: ["Black Beans", "Kidney Beans", "Canned Beans"] },
  { name: "Tuna", category: "Canned Goods", aliases: ["Canned Tuna"] },
  
  // Beverages
  { name: "Water", category: "Beverages", aliases: ["Bottled Water", "Sparkling Water"] },
  { name: "Coffee", category: "Beverages", aliases: ["Ground Coffee", "Coffee Beans"] },
  { name: "Tea", category: "Beverages", aliases: ["Green Tea", "Black Tea", "Tea Bags"] },
  { name: "Juice", category: "Beverages", aliases: ["Orange Juice", "Apple Juice"] },
  { name: "Soda", category: "Beverages", aliases: ["Cola", "Soft Drinks"] },
  
  // Snacks
  { name: "Chips", category: "Snacks", aliases: ["Potato Chips", "Tortilla Chips"] },
  { name: "Crackers", category: "Snacks" },
  { name: "Cookies", category: "Snacks", aliases: ["Cookie"] },
  { name: "Cereal", category: "Snacks", aliases: ["Breakfast Cereal"] },
  
  // Frozen
  { name: "Ice Cream", category: "Frozen", aliases: ["Frozen Yogurt"] },
  { name: "Frozen Vegetables", category: "Frozen", aliases: ["Frozen Peas", "Frozen Corn"] },
  { name: "Frozen Pizza", category: "Frozen" },
  
  // Household
  { name: "Toilet Paper", category: "Household", aliases: ["TP", "Bathroom Tissue"] },
  { name: "Paper Towels", category: "Household", aliases: ["Kitchen Towels"] },
  { name: "Laundry Detergent", category: "Household", aliases: ["Detergent"] },
  { name: "Dish Soap", category: "Household", aliases: ["Dishwashing Liquid"] },
  { name: "Trash Bags", category: "Household", aliases: ["Garbage Bags"] },
  
  // Personal Care
  { name: "Shampoo", category: "Personal Care" },
  { name: "Toothpaste", category: "Personal Care" },
  { name: "Soap", category: "Personal Care", aliases: ["Bar Soap", "Body Wash"] },
  { name: "Deodorant", category: "Personal Care" },
];

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.toLowerCase().trim() || "";

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    const results: Array<{ name: string; category?: string }> = [];
    const seen = new Set<string>();

    // Search local database first (faster, more relevant to common products)
    for (const product of PRODUCT_DATABASE) {
      // Check main name
      if (product.name.toLowerCase().includes(query)) {
        if (!seen.has(product.name.toLowerCase())) {
          results.push({ name: product.name, category: product.category });
          seen.add(product.name.toLowerCase());
        }
      }

      // Check aliases
      if (product.aliases) {
        for (const alias of product.aliases) {
          if (alias.toLowerCase().includes(query) && !seen.has(alias.toLowerCase())) {
            results.push({ name: alias, category: product.category });
            seen.add(alias.toLowerCase());
          }
        }
      }
    }

    // If we have fewer than 10 results, query Wikidata for additional products
    if (results.length < 10) {
      try {
        const wikidataResults = await searchWikidata(query);
        
        for (const item of wikidataResults) {
          const nameLower = item.name.toLowerCase();
          // Only add if not already seen and we need more results
          if (!seen.has(nameLower) && results.length < 15) {
            results.push(item);
            seen.add(nameLower);
          }
        }
      } catch (error) {
        // If Wikidata fails, continue with local results
        console.warn("Wikidata search failed, using local results only:", error);
      }
    }

    // Sort by relevance (exact matches first, then partial matches)
    results.sort((a, b) => {
      const aExact = a.name.toLowerCase().startsWith(query);
      const bExact = b.name.toLowerCase().startsWith(query);
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return a.name.localeCompare(b.name);
    });

    // Limit to top 10 suggestions
    const suggestions = results.slice(0, 10);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    );
  }
}

