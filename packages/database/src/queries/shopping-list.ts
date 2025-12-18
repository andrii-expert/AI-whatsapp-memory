import { eq, and, desc, asc, or } from "drizzle-orm";
import type { Database } from "../client";
import { shoppingListItems } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Shopping List Items
// ============================================

export async function getUserShoppingListItems(
  db: Database,
  userId: string,
  options?: {
    folderId?: string;
    status?: "open" | "completed" | "archived";
  }
) {
  return withQueryLogging(
    'getUserShoppingListItems',
    { userId, options },
    async () => {
      const whereConditions = [eq(shoppingListItems.userId, userId)];
      
      if (options?.folderId) {
        whereConditions.push(eq(shoppingListItems.folderId, options.folderId));
      }
      
      if (options?.status) {
        whereConditions.push(eq(shoppingListItems.status, options.status));
      }

      return db.query.shoppingListItems.findMany({
        where: and(...whereConditions),
        orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
        with: {
          folder: true,
        },
      });
    }
  );
}

export async function getShoppingListItemById(
  db: Database,
  itemId: string,
  userId: string
) {
  return withQueryLogging(
    'getShoppingListItemById',
    { itemId, userId },
    async () => {
      return db.query.shoppingListItems.findFirst({
        where: and(
          eq(shoppingListItems.id, itemId),
          eq(shoppingListItems.userId, userId)
        ),
      });
    }
  );
}

export async function createShoppingListItem(
  db: Database,
  data: {
    userId: string;
    folderId?: string;
    name: string;
    description?: string;
    status?: "open" | "completed" | "archived";
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'createShoppingListItem',
    { userId: data.userId, name: data.name },
    async () => {
      const [item] = await db
        .insert(shoppingListItems)
        .values({
          userId: data.userId,
          folderId: data.folderId,
          name: data.name,
          description: data.description,
          status: data.status || "open",
          sortOrder: data.sortOrder ?? 0,
          updatedAt: new Date(),
        })
        .returning();

      return item;
    }
  );
}

export async function updateShoppingListItem(
  db: Database,
  itemId: string,
  userId: string,
  data: {
    name?: string;
    description?: string;
    folderId?: string | null;
    status?: "open" | "completed" | "archived";
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateShoppingListItem',
    { itemId, userId, updates: Object.keys(data) },
    async () => {
      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.folderId !== undefined) {
        updateData.folderId = data.folderId;
      }
      if (data.status !== undefined) {
        updateData.status = data.status;
        // Set completedAt when status changes to completed
        if (data.status === "completed") {
          updateData.completedAt = new Date();
        } else if (data.status === "open") {
          updateData.completedAt = null;
        }
      }
      if (data.sortOrder !== undefined) {
        updateData.sortOrder = data.sortOrder;
      }

      const [item] = await db
        .update(shoppingListItems)
        .set(updateData)
        .where(
          and(
            eq(shoppingListItems.id, itemId),
            eq(shoppingListItems.userId, userId)
          )
        )
        .returning();

      return item;
    }
  );
}

export async function deleteShoppingListItem(
  db: Database,
  itemId: string,
  userId: string
) {
  return withMutationLogging(
    'deleteShoppingListItem',
    { itemId, userId },
    async () => {
      const [item] = await db
        .delete(shoppingListItems)
        .where(
          and(
            eq(shoppingListItems.id, itemId),
            eq(shoppingListItems.userId, userId)
          )
        )
        .returning();

      return item;
    }
  );
}

export async function toggleShoppingListItemStatus(
  db: Database,
  itemId: string,
  userId: string
) {
  return withMutationLogging(
    'toggleShoppingListItemStatus',
    { itemId, userId },
    async () => {
      const item = await getShoppingListItemById(db, itemId, userId);
      
      if (!item) {
        throw new Error("Shopping list item not found");
      }

      const newStatus = item.status === "open" ? "completed" : "open";
      
      return updateShoppingListItem(db, itemId, userId, {
        status: newStatus,
      });
    }
  );
}

