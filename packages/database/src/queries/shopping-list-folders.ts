import { eq, and, desc, asc, isNull, or, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { shoppingListItems, shoppingListFolders, taskShares } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Shopping List Folders
// ============================================

export async function getUserShoppingListFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserShoppingListFolders',
    { userId },
    async () => {
      // Get folders owned by user
      const ownedFolders = await db.query.shoppingListFolders.findMany({
        where: and(
          eq(shoppingListFolders.userId, userId),
          isNull(shoppingListFolders.parentId)
        ),
        orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
        with: {
          subfolders: {
            orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
            with: {
              subfolders: {
                orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
                with: {
                  items: {
                    orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
                    with: {
                      user: {
                        columns: {
                          id: true,
                          firstName: true,
                          lastName: true,
                          email: true,
                        },
                      },
                    },
                  },
                },
              },
              items: {
                orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
                with: {
                  user: {
                    columns: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          items: {
            orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
            with: {
              user: {
                columns: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      // Get folders shared with user (with permission info)
      const sharedFolderData = await db
        .select({ 
          folderId: taskShares.resourceId,
          permission: taskShares.permission,
          ownerId: taskShares.ownerId,
        })
        .from(taskShares)
        .where(
          and(
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.resourceType, "shopping_list_folder")
          )
        );

      let sharedFolders: any[] = [];
      if (sharedFolderData.length > 0) {
        const folderIds = sharedFolderData.map(s => s.folderId);
        const folders = await db.query.shoppingListFolders.findMany({
          where: and(
            inArray(shoppingListFolders.id, folderIds),
            isNull(shoppingListFolders.parentId)
          ),
          orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
          with: {
            subfolders: {
              orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
              with: {
                subfolders: {
                  orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
                  with: {
                    items: {
                      orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
                      with: {
                        user: {
                          columns: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
                items: {
                  orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
                  with: {
                    user: {
                      columns: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        email: true,
                      },
                    },
                  },
                },
              },
            },
            items: {
              orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
              with: {
                user: {
                  columns: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        });

        // Add share metadata to folders
        sharedFolders = folders.map(folder => {
          const shareData = sharedFolderData.find(s => s.folderId === folder.id);
          return {
            ...folder,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
          };
        });
      }

      return [...ownedFolders, ...sharedFolders];
    }
  );
}

export async function getShoppingListFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getShoppingListFolderById',
    { folderId, userId },
    async () => {
      // Get the folder
      const folder = await db.query.shoppingListFolders.findFirst({
        where: eq(shoppingListFolders.id, folderId),
        with: {
          parent: true,
          subfolders: {
            orderBy: [asc(shoppingListFolders.sortOrder), asc(shoppingListFolders.createdAt)],
            with: {
              items: {
                orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
                with: {
                  user: {
                    columns: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                    },
                  },
                },
              },
            },
          },
          items: {
            orderBy: [asc(shoppingListItems.sortOrder), desc(shoppingListItems.createdAt)],
            with: {
              user: {
                columns: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!folder) {
        return null;
      }

      // Check if user owns it
      if (folder.userId === userId) {
        return folder;
      }

      // Check if folder is shared with user
      const share = await db.query.taskShares.findFirst({
        where: and(
          eq(taskShares.resourceType, "shopping_list_folder"),
          eq(taskShares.resourceId, folderId),
          eq(taskShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return {
          ...folder,
          isSharedWithMe: true,
          sharePermission: share.permission,
        };
      }

      // Check if parent folder is shared
      if (folder.parentId) {
        const parentShare = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "shopping_list_folder"),
            eq(taskShares.resourceId, folder.parentId),
            eq(taskShares.sharedWithUserId, userId)
          ),
        });

        if (parentShare) {
          return {
            ...folder,
            isSharedWithMe: true,
            sharePermission: parentShare.permission,
            sharedViaParent: true,
          };
        }
      }

      // User has no access
      return null;
    }
  );
}

export async function createShoppingListFolder(
  db: Database,
  data: {
    userId: string;
    parentId?: string;
    name: string;
    color?: string;
    icon?: string;
  }
) {
  return withMutationLogging(
    'createShoppingListFolder',
    { userId: data.userId, name: data.name, parentId: data.parentId },
    async () => {
      // If creating a category (subfolder), check if user has access to parent
      if (data.parentId) {
        const parentFolder = await db.query.shoppingListFolders.findFirst({
          where: eq(shoppingListFolders.id, data.parentId),
        });

        if (parentFolder) {
          const isOwner = parentFolder.userId === data.userId;

          // If not owner, check if parent folder is shared with edit permission
          if (!isOwner) {
            const share = await db.query.taskShares.findFirst({
              where: and(
                eq(taskShares.resourceType, "shopping_list_folder"),
                eq(taskShares.resourceId, data.parentId),
                eq(taskShares.sharedWithUserId, data.userId),
                eq(taskShares.permission, "edit")
              ),
            });

            if (!share) {
              throw new Error("No permission to create categories in this folder");
            }
          }
        }
      }

      // Check if this is the user's first root folder (no parentId)
      // If so, and no primary folder exists, set this as primary
      let isPrimary = false;
      if (!data.parentId) {
        const existingPrimary = await db.query.shoppingListFolders.findFirst({
          where: and(
            eq(shoppingListFolders.userId, data.userId),
            eq(shoppingListFolders.isPrimary, true)
          ),
        });
        
        // If no primary folder exists, set this as primary
        if (!existingPrimary) {
          isPrimary = true;
        }
      }

      const [folder] = await db.insert(shoppingListFolders).values({
        ...data,
        isPrimary,
      }).returning();
      return folder;
    }
  );
}

export async function updateShoppingListFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: {
    name?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
    isPrimary?: boolean;
  }
) {
  return withMutationLogging(
    'updateShoppingListFolder',
    { folderId, userId },
    async () => {
      // First check if user owns the folder
      const folder = await db.query.shoppingListFolders.findFirst({
        where: eq(shoppingListFolders.id, folderId),
      });

      if (!folder) {
        throw new Error("Folder not found");
      }

      // If user owns the folder, allow update
      const isOwner = folder.userId === userId;

      // If not owner, check if folder is shared with edit permission
      if (!isOwner) {
        const share = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "shopping_list_folder"),
            eq(taskShares.resourceId, folderId),
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.permission, "edit")
          ),
        });

        // If no direct folder share, check parent folder share
        if (!share && folder.parentId) {
          const parentShare = await db.query.taskShares.findFirst({
            where: and(
              eq(taskShares.resourceType, "shopping_list_folder"),
              eq(taskShares.resourceId, folder.parentId),
              eq(taskShares.sharedWithUserId, userId),
              eq(taskShares.permission, "edit")
            ),
          });

          if (!parentShare) {
            throw new Error("You have view permission only. You cannot edit this folder because you are on view permission.");
          }
        } else if (!share) {
          throw new Error("You have view permission only. You cannot edit this folder because you are on view permission.");
        }
      }

      // Handle isPrimary: if setting to true, unset all other primary folders
      if (data.isPrimary === true && isOwner) {
        // Only root folders can be primary
        if (folder.parentId) {
          throw new Error("Only root folders can be set as primary");
        }

        // Unset all other primary folders for this user (excluding current folder)
        await db
          .update(shoppingListFolders)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(
            and(
              eq(shoppingListFolders.userId, userId),
              eq(shoppingListFolders.isPrimary, true)
            )
          );
      }

      const [updatedFolder] = await db
        .update(shoppingListFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(shoppingListFolders.id, folderId))
        .returning();
      return updatedFolder;
    }
  );
}

export async function deleteShoppingListFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'deleteShoppingListFolder',
    { folderId, userId },
    async () => {
      // First check if user owns the folder
      const folder = await db.query.shoppingListFolders.findFirst({
        where: eq(shoppingListFolders.id, folderId),
      });

      if (!folder) {
        throw new Error("Folder not found");
      }

      // Only owners can delete folders
      if (folder.userId !== userId) {
        throw new Error("No permission to delete this folder");
      }

      // Delete the folder (cascade will handle subfolders and items)
      await db.delete(shoppingListFolders).where(eq(shoppingListFolders.id, folderId));
      return { success: true };
    }
  );
}

/**
 * Get the primary shopping list folder for a user
 * Returns null if no primary folder is set
 */
export async function getPrimaryShoppingListFolder(db: Database, userId: string) {
  return withQueryLogging(
    'getPrimaryShoppingListFolder',
    { userId },
    async () => {
      const folder = await db.query.shoppingListFolders.findFirst({
        where: and(
          eq(shoppingListFolders.userId, userId),
          eq(shoppingListFolders.isPrimary, true),
          isNull(shoppingListFolders.parentId) // Only root folders can be primary
        ),
      });

      return folder || null;
    }
  );
}

/**
 * Set a folder as primary and unset all other primary folders for the user
 * Only the folder owner can set it as primary
 */
export async function setPrimaryShoppingListFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'setPrimaryShoppingListFolder',
    { folderId, userId },
    async () => {
      // First check if user owns the folder
      const folder = await db.query.shoppingListFolders.findFirst({
        where: eq(shoppingListFolders.id, folderId),
      });

      if (!folder) {
        throw new Error("Folder not found");
      }

      // Only owners can set folder as primary
      if (folder.userId !== userId) {
        throw new Error("No permission to set this folder as primary");
      }

      // Only root folders can be primary
      if (folder.parentId) {
        throw new Error("Only root folders can be set as primary");
      }

      // Unset all other primary folders for this user
      await db
        .update(shoppingListFolders)
        .set({ isPrimary: false, updatedAt: new Date() })
        .where(
          and(
            eq(shoppingListFolders.userId, userId),
            eq(shoppingListFolders.isPrimary, true)
          )
        );

      // Set this folder as primary
      const [updatedFolder] = await db
        .update(shoppingListFolders)
        .set({ isPrimary: true, updatedAt: new Date() })
        .where(eq(shoppingListFolders.id, folderId))
        .returning();

      return updatedFolder;
    }
  );
}
