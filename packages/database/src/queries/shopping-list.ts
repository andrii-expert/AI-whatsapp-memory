import { eq, and, desc, asc, or, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { shoppingListItems, shoppingListFolders } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";
import { checkShoppingListFolderAccess } from "./task-sharing";

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
      // Get all folders owned by the user (to include items created by shared users in owned folders)
      const ownedFolders = await db.query.shoppingListFolders.findMany({
        where: eq(shoppingListFolders.userId, userId),
        columns: { id: true },
      });
      const ownedFolderIds = ownedFolders.map(f => f.id);
      
      // Build where conditions:
      // 1. Items created by the user, OR
      // 2. Items in folders owned by the user (even if created by shared users)
      const userIdCondition = eq(shoppingListItems.userId, userId);
      const folderCondition = ownedFolderIds.length > 0 
        ? inArray(shoppingListItems.folderId, ownedFolderIds)
        : undefined;
      
      const whereConditions: any[] = [
        folderCondition 
          ? or(userIdCondition, folderCondition)!
          : userIdCondition
      ];
      
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
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
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
      // First, get the item without userId filter
      const item = await db.query.shoppingListItems.findFirst({
        where: eq(shoppingListItems.id, itemId),
        with: {
          folder: true,
          user: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      if (!item) {
        return null;
      }

      // Check if user owns the item
      if (item.userId === userId) {
        return item;
      }

      // Check if item is in a folder owned by the user (to allow owner to see items created by shared users)
      if (item.folderId && item.folder) {
        if (item.folder.userId === userId) {
          return item;
        }
      }

      // Check if user has access via folder sharing
      if (item.folderId) {
        const folderAccess = await checkShoppingListFolderAccess(db, item.folderId, userId);
        if (folderAccess.hasAccess) {
          return item;
        }
      }

      // User has no access
      return null;
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
    category?: string;
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
          category: data.category,
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
    category?: string | null;
    status?: "open" | "completed" | "archived";
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateShoppingListItem',
    { itemId, userId, updates: Object.keys(data) },
    async () => {
      // First, get the item to check its folder and ownership
      const existingItem = await db.query.shoppingListItems.findFirst({
        where: eq(shoppingListItems.id, itemId),
      });

      if (!existingItem) {
        throw new Error("Shopping list item not found");
      }

      // Check if user owns the item
      const isOwner = existingItem.userId === userId;

      // If not owner, check folder permission
      if (!isOwner && existingItem.folderId) {
        const folderAccess = await checkShoppingListFolderAccess(db, existingItem.folderId, userId);
        // Folder owners always have full edit permission, even for items created by shared users
        if (!folderAccess.hasAccess || (folderAccess.permission !== "edit" && folderAccess.permission !== "owner")) {
          throw new Error("You have view permission only. You cannot edit this item because you are on view permission.");
        }
      }

      // If moving to a different folder, check permission on target folder
      if (data.folderId !== undefined && data.folderId !== existingItem.folderId && data.folderId) {
        const targetFolderAccess = await checkShoppingListFolderAccess(db, data.folderId, userId);
        // Folder owners always have full edit permission
        if (!targetFolderAccess.hasAccess || (targetFolderAccess.permission !== "edit" && targetFolderAccess.permission !== "owner")) {
          throw new Error("You have view permission only. You cannot move this item because you are on view permission.");
        }
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) {
        updateData.name = data.name;
      }
      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.category !== undefined) {
        updateData.category = data.category;
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

      // If user owns the item, allow update directly
      // If user has edit permission on folder (checked above), also allow update
      const [item] = await db
        .update(shoppingListItems)
        .set(updateData)
        .where(eq(shoppingListItems.id, itemId))
        .returning();

      if (!item) {
        throw new Error("Shopping list item not found");
      }

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
      // First, get the item to check its folder and ownership
      const existingItem = await db.query.shoppingListItems.findFirst({
        where: eq(shoppingListItems.id, itemId),
      });

      if (!existingItem) {
        throw new Error("Shopping list item not found");
      }

      // Check if user owns the item
      const isOwner = existingItem.userId === userId;

      // If not owner, check folder permission
      if (!isOwner && existingItem.folderId) {
        const folderAccess = await checkShoppingListFolderAccess(db, existingItem.folderId, userId);
        // Folder owners always have full edit permission, even for items created by shared users
        if (!folderAccess.hasAccess || (folderAccess.permission !== "edit" && folderAccess.permission !== "owner")) {
          throw new Error("You have view permission only. You cannot delete this item because you are on view permission.");
        }
      }

      const [item] = await db
        .delete(shoppingListItems)
        .where(eq(shoppingListItems.id, itemId))
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
      // Get the item without userId filter to support shared items
      const item = await db.query.shoppingListItems.findFirst({
        where: eq(shoppingListItems.id, itemId),
      });
      
      if (!item) {
        throw new Error("Shopping list item not found");
      }

      // Check if user owns the item
      const isOwner = item.userId === userId;

      // If not owner, check folder permission
      if (!isOwner && item.folderId) {
        const folderAccess = await checkShoppingListFolderAccess(db, item.folderId, userId);
        // Folder owners always have full edit permission, even for items created by shared users
        if (!folderAccess.hasAccess || (folderAccess.permission !== "edit" && folderAccess.permission !== "owner")) {
          throw new Error("You have view permission only. You cannot edit this item because you are on view permission.");
        }
      }

      const newStatus = item.status === "open" ? "completed" : "open";
      
      // Use updateShoppingListItem which will handle the actual update
      // (it already has permission checks, but we check here too for early failure)
      return updateShoppingListItem(db, itemId, userId, {
        status: newStatus,
      });
    }
  );
}

