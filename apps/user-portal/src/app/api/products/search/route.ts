import { NextRequest, NextResponse } from "next/server";

// Common shopping/product items database for autocomplete
// In production, this would be replaced with Algolia or another product search API
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

    // Simple fuzzy search through product database
    const results: Array<{ name: string; category?: string }> = [];
    const seen = new Set<string>();

    for (const product of PRODUCT_DATABASE) {
      // Check main name
      if (product.name.toLowerCase().includes(query)) {
        if (!seen.has(product.name)) {
          results.push({ name: product.name, category: product.category });
          seen.add(product.name);
        }
      }

      // Check aliases
      if (product.aliases) {
        for (const alias of product.aliases) {
          if (alias.toLowerCase().includes(query) && !seen.has(alias)) {
            results.push({ name: alias, category: product.category });
            seen.add(alias);
          }
        }
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

