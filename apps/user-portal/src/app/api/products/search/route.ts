import { NextRequest, NextResponse } from "next/server";

/**
 * Query Wikidata API for product information
 * Searches for items that are products, food items, consumer goods, or related categories
 * Uses Wikidata as the primary source for all product searches
 */
async function searchWikidata(query: string): Promise<Array<{ name: string; category?: string }>> {
  try {
    // Sanitize query for SPARQL (escape special characters)
    const sanitizedQuery = query.replace(/['"\\]/g, '').trim();
    
    if (!sanitizedQuery || sanitizedQuery.length < 2) {
      return [];
    }
    
    // Wikidata SPARQL endpoint - comprehensive search for products, food items, consumer goods
    // Uses multiple UNION clauses to search across different product types
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
          # Exclude the base categories we're already searching for
          FILTER(?category != wd:Q28877 && ?category != wd:Q2095 && ?category != wd:Q33506 && ?category != wd:Q40050)
        }
      }
      ORDER BY ASC(?itemLabel)
      LIMIT 50
    `;

    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`;
    
    // Add timeout to prevent hanging (8 seconds for Wikidata)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WhatsApp-Shopping-List/1.0'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      console.warn(`Wikidata API returned ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results: Array<{ name: string; category?: string }> = [];
    const seen = new Set<string>();

    if (data.results?.bindings) {
      for (const binding of data.results.bindings) {
        const name = binding.itemLabel?.value;
        const category = binding.categoryLabel?.value;
        
        if (name) {
          const nameLower = name.toLowerCase();
          const queryLower = query.toLowerCase();
          // Deduplicate and ensure it matches the query
          if (!seen.has(nameLower) && nameLower.includes(queryLower)) {
            // Normalize category name (capitalize first letter)
            const normalizedCategory = category 
              ? category.charAt(0).toUpperCase() + category.slice(1)
              : undefined;
            
            results.push({
              name: name,
              category: normalizedCategory
            });
            seen.add(nameLower);
          }
        }
      }
    }

    return results;
  } catch (error) {
    if (error instanceof Error) {
      // Ignore timeout/abort errors, log others
      if (error.name !== 'AbortError' && !error.message.includes('aborted')) {
        console.error("Error querying Wikidata:", error);
      }
    }
    return [];
  }
}

/**
 * GET handler for product search
 * Uses Wikidata as the primary and only source for product searches
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.toLowerCase().trim() || "";

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Query Wikidata for products
    const results = await searchWikidata(query);

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

