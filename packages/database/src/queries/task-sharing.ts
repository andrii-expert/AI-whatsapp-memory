import { eq, and, or, ilike, ne, isNull, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import { taskShares, tasks, taskFolders, users, friends } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Task and Folder Sharing Queries
// ============================================

/**
 * Create a new share for a task or folder
 */
export async function createTaskShare(
  db: Database,
  data: {
    ownerId: string;
    sharedWithUserId: string;
    resourceType: "task" | "task_folder";
    resourceId: string;
    permission: "view" | "edit";
  }
) {
  return withMutationLogging(
    'createTaskShare',
    { 
      ownerId: data.ownerId, 
      sharedWithUserId: data.sharedWithUserId,
      resourceType: data.resourceType,
      resourceId: data.resourceId 
    },
    async () => {
      // Check if share already exists and update it if so
      const existingShare = await db.query.taskShares.findFirst({
        where: and(
          eq(taskShares.ownerId, data.ownerId),
          eq(taskShares.sharedWithUserId, data.sharedWithUserId),
          eq(taskShares.resourceType, data.resourceType),
          eq(taskShares.resourceId, data.resourceId)
        ),
      });

      if (existingShare) {
        // Update existing share
        const [updated] = await db
          .update(taskShares)
          .set({ 
            permission: data.permission,
            updatedAt: new Date() 
          })
          .where(eq(taskShares.id, existingShare.id))
          .returning();
        return updated;
      }

      // Create new share
      const [share] = await db.insert(taskShares).values(data).returning();
      return share;
    }
  );
}

/**
 * Get all shares for a specific resource
 */
export async function getResourceShares(
  db: Database,
  resourceType: "task" | "task_folder",
  resourceId: string,
  ownerId: string
) {
  return withQueryLogging(
    'getResourceShares',
    { resourceType, resourceId, ownerId },
    () => db.query.taskShares.findMany({
      where: and(
        eq(taskShares.ownerId, ownerId),
        eq(taskShares.resourceType, resourceType),
        eq(taskShares.resourceId, resourceId)
      ),
      with: {
        sharedWithUser: {
          columns: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    })
  );
}

/**
 * Get all shares created by a user (owner perspective)
 */
export async function getUserShares(db: Database, userId: string) {
  return withQueryLogging(
    'getUserShares',
    { userId },
    () => db.query.taskShares.findMany({
      where: eq(taskShares.ownerId, userId),
      with: {
        sharedWithUser: {
          columns: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    })
  );
}

/**
 * Get all shares where user is the recipient (shared with me)
 */
export async function getSharedWithMe(db: Database, userId: string) {
  return withQueryLogging(
    'getSharedWithMe',
    { userId },
    () => db.query.taskShares.findMany({
      where: eq(taskShares.sharedWithUserId, userId),
      with: {
        owner: {
          columns: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    })
  );
}

/**
 * Update share permission
 */
export async function updateSharePermission(
  db: Database,
  shareId: string,
  ownerId: string,
  permission: "view" | "edit"
) {
  return withMutationLogging(
    'updateSharePermission',
    { shareId, ownerId, permission },
    async () => {
      const [share] = await db
        .update(taskShares)
        .set({ 
          permission,
          updatedAt: new Date() 
        })
        .where(and(
          eq(taskShares.id, shareId),
          eq(taskShares.ownerId, ownerId)
        ))
        .returning();
      return share;
    }
  );
}

/**
 * Delete a share
 */
export async function deleteTaskShare(
  db: Database,
  shareId: string,
  ownerId: string
) {
  return withMutationLogging(
    'deleteTaskShare',
    { shareId, ownerId },
    () => db.delete(taskShares).where(and(
      eq(taskShares.id, shareId),
      eq(taskShares.ownerId, ownerId)
    ))
  );
}

/**
 * Check if user has access to a task
 */
export async function checkTaskAccess(
  db: Database,
  taskId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkTaskAccess',
    { taskId, userId },
    async () => {
      // Check if user owns the task
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
      });

      if (!task) {
        return { hasAccess: false, permission: null };
      }

      if (task.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if task is shared with user
      const share = await db.query.taskShares.findFirst({
        where: and(
          eq(taskShares.resourceType, "task"),
          eq(taskShares.resourceId, taskId),
          eq(taskShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared with user
      if (task.folderId) {
        const folderShare = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task_folder"),
            eq(taskShares.resourceId, task.folderId),
            eq(taskShares.sharedWithUserId, userId)
          ),
        });

        if (folderShare) {
          return { hasAccess: true, permission: folderShare.permission };
        }
      }

      return { hasAccess: false, permission: null };
    }
  );
}

/**
 * Check if user has access to a folder
 */
export async function checkFolderAccess(
  db: Database,
  folderId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkFolderAccess',
    { folderId, userId },
    async () => {
      // Check if user owns the folder
      const folder = await db.query.taskFolders.findFirst({
        where: eq(taskFolders.id, folderId),
      });

      if (!folder) {
        return { hasAccess: false, permission: null };
      }

      if (folder.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if folder is shared with user
      const share = await db.query.taskShares.findFirst({
        where: and(
          eq(taskShares.resourceType, "task_folder"),
          eq(taskShares.resourceId, folderId),
          eq(taskShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared (recursive check)
      if (folder.parentId) {
        return checkFolderAccess(db, folder.parentId, userId);
      }

      return { hasAccess: false, permission: null };
    }
  );
}

/**
 * Get all tasks and folders shared with a user
 */
export async function getSharedResourcesForUser(db: Database, userId: string) {
  return withQueryLogging(
    'getSharedResourcesForUser',
    { userId },
    async () => {
      const shares = await db.query.taskShares.findMany({
        where: eq(taskShares.sharedWithUserId, userId),
        with: {
          owner: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          },
        },
      });

      // Fetch full task and folder details
      const taskIds = shares
        .filter(s => s.resourceType === "task")
        .map(s => s.resourceId);
      
      const folderIds = shares
        .filter(s => s.resourceType === "task_folder")
        .map(s => s.resourceId);

      const sharedTasks = taskIds.length > 0 
        ? await db.query.tasks.findMany({
            where: or(...taskIds.map(id => eq(tasks.id, id))),
            with: {
              folder: true,
            },
          })
        : [];

      const sharedFolders = folderIds.length > 0
        ? await db.query.taskFolders.findMany({
            where: or(...folderIds.map(id => eq(taskFolders.id, id))),
            with: {
              tasks: true,
              subfolders: true,
            },
          })
        : [];

      return {
        tasks: sharedTasks.map(task => ({
          ...task,
          shareInfo: shares.find(s => s.resourceId === task.id),
        })),
        folders: sharedFolders.map(folder => ({
          ...folder,
          shareInfo: shares.find(s => s.resourceId === folder.id),
        })),
      };
    }
  );
}

/**
 * Search users by email, phone number, or friend name (for sharing)
 */
export async function searchUsersForSharing(
  db: Database,
  searchTerm: string,
  currentUserId: string
) {
  return withQueryLogging(
    'searchUsersForSharing',
    { searchTerm, currentUserId },
    async () => {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      const foundUserIds = new Set<string>();
      const foundUsers: Array<{
        id: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
        phoneNumber: string | null;
      }> = [];
      
      // First, search by email or phone (case-insensitive, partial match), excluding current user and deleted users
      const usersByEmailOrPhone = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          phoneNumber: users.phone,
        })
        .from(users)
        .where(
          and(
            ne(users.id, currentUserId), // Exclude current user
            isNull(users.deletedAt), // Exclude soft-deleted users
            or(
              ilike(users.email, searchPattern), // Case-insensitive pattern match for email
              and(
                isNotNull(users.phone), // Only search phone if it's not null
                ilike(users.phone, searchPattern) // Case-insensitive pattern match for phone
              )
            )
          )
        )
        .limit(10);

      // Add users found by email/phone
      for (const user of usersByEmailOrPhone) {
        if (!foundUserIds.has(user.id)) {
          foundUserIds.add(user.id);
          foundUsers.push(user);
        }
      }

      // Then, search by friend name in the user's friend list
      const friendsByName = await db
        .select({
          friendId: friends.id,
          friendName: friends.name,
          connectedUserId: friends.connectedUserId,
          friendEmail: friends.email,
          friendPhone: friends.phone,
        })
        .from(friends)
        .where(
          and(
            eq(friends.userId, currentUserId),
            ilike(friends.name, searchPattern) // Case-insensitive pattern match for friend name
          )
        )
        .limit(10);

      // For each friend found, try to find the connected user
      for (const friend of friendsByName) {
        // If friend has a connectedUserId, use that
        if (friend.connectedUserId && !foundUserIds.has(friend.connectedUserId)) {
          const connectedUser = await db.query.users.findFirst({
            where: and(
              eq(users.id, friend.connectedUserId),
              isNull(users.deletedAt)
            ),
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
            },
          });

          if (connectedUser) {
            foundUserIds.add(connectedUser.id);
            foundUsers.push({
              id: connectedUser.id,
              email: connectedUser.email,
              firstName: connectedUser.firstName,
              lastName: connectedUser.lastName,
              phoneNumber: connectedUser.phone,
            });
          }
        } else if (friend.friendEmail || friend.friendPhone) {
          // If friend doesn't have connectedUserId but has email/phone, search for user by that
          const userByFriendContact = await db
            .select({
              id: users.id,
              email: users.email,
              firstName: users.firstName,
              lastName: users.lastName,
              phoneNumber: users.phone,
            })
            .from(users)
            .where(
              and(
                ne(users.id, currentUserId),
                isNull(users.deletedAt),
                or(
                  friend.friendEmail ? ilike(users.email, `%${friend.friendEmail.toLowerCase()}%`) : undefined,
                  friend.friendPhone ? ilike(users.phone, `%${friend.friendPhone}%`) : undefined
                )
              )
            )
            .limit(1);

          if (userByFriendContact.length > 0 && !foundUserIds.has(userByFriendContact[0].id)) {
            foundUserIds.add(userByFriendContact[0].id);
            foundUsers.push(userByFriendContact[0]);
          }
        }
      }

      return foundUsers.slice(0, 10);
    }
  );
}

