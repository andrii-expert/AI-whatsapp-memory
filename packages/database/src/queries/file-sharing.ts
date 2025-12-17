import { eq, and, or, ilike, ne, isNull, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import { fileShares, userFiles, userFileFolders, users, friends } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// File and Folder Sharing Queries
// ============================================

/**
 * Create a new share for a file or folder
 */
export async function createFileShare(
  db: Database,
  data: {
    ownerId: string;
    sharedWithUserId: string;
    resourceType: "file" | "file_folder";
    resourceId: string;
    permission: "view" | "edit";
  }
) {
  return withMutationLogging(
    'createFileShare',
    { 
      ownerId: data.ownerId, 
      sharedWithUserId: data.sharedWithUserId,
      resourceType: data.resourceType,
      resourceId: data.resourceId 
    },
    async () => {
      // Check if share already exists and update it if so
      const existingShare = await db.query.fileShares.findFirst({
        where: and(
          eq(fileShares.ownerId, data.ownerId),
          eq(fileShares.sharedWithUserId, data.sharedWithUserId),
          eq(fileShares.resourceType, data.resourceType),
          eq(fileShares.resourceId, data.resourceId)
        ),
      });

      if (existingShare) {
        // Update existing share
        const [updated] = await db
          .update(fileShares)
          .set({ 
            permission: data.permission,
            updatedAt: new Date() 
          })
          .where(eq(fileShares.id, existingShare.id))
          .returning();
        return updated;
      }

      // Create new share
      const [share] = await db.insert(fileShares).values(data).returning();
      return share;
    }
  );
}

/**
 * Get all shares for a specific resource
 */
export async function getFileResourceShares(
  db: Database,
  resourceType: "file" | "file_folder",
  resourceId: string,
  ownerId: string
) {
  return withQueryLogging(
    'getFileResourceShares',
    { resourceType, resourceId, ownerId },
    () => db.query.fileShares.findMany({
      where: and(
        eq(fileShares.ownerId, ownerId),
        eq(fileShares.resourceType, resourceType),
        eq(fileShares.resourceId, resourceId)
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
export async function getUserFileShares(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFileShares',
    { userId },
    () => db.query.fileShares.findMany({
      where: eq(fileShares.ownerId, userId),
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
export async function getFileSharedWithMe(db: Database, userId: string) {
  return withQueryLogging(
    'getFileSharedWithMe',
    { userId },
    () => db.query.fileShares.findMany({
      where: eq(fileShares.sharedWithUserId, userId),
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
export async function updateFileSharePermission(
  db: Database,
  shareId: string,
  ownerId: string,
  permission: "view" | "edit"
) {
  return withMutationLogging(
    'updateFileSharePermission',
    { shareId, ownerId, permission },
    async () => {
      const [share] = await db
        .update(fileShares)
        .set({ 
          permission,
          updatedAt: new Date() 
        })
        .where(and(
          eq(fileShares.id, shareId),
          eq(fileShares.ownerId, ownerId)
        ))
        .returning();
      return share;
    }
  );
}

/**
 * Delete a share
 */
export async function deleteFileShare(
  db: Database,
  shareId: string,
  ownerId: string
) {
  return withMutationLogging(
    'deleteFileShare',
    { shareId, ownerId },
    () => db.delete(fileShares).where(and(
      eq(fileShares.id, shareId),
      eq(fileShares.ownerId, ownerId)
    ))
  );
}

/**
 * Check if user has access to a file
 */
export async function checkFileAccess(
  db: Database,
  fileId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkFileAccess',
    { fileId, userId },
    async () => {
      // Check if user owns the file
      const file = await db.query.userFiles.findFirst({
        where: eq(userFiles.id, fileId),
      });

      if (!file) {
        return { hasAccess: false, permission: null };
      }

      if (file.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if file is shared with user
      const share = await db.query.fileShares.findFirst({
        where: and(
          eq(fileShares.resourceType, "file"),
          eq(fileShares.resourceId, fileId),
          eq(fileShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared with user
      if (file.folderId) {
        const folderShare = await db.query.fileShares.findFirst({
          where: and(
            eq(fileShares.resourceType, "file_folder"),
            eq(fileShares.resourceId, file.folderId),
            eq(fileShares.sharedWithUserId, userId)
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
export async function checkFileFolderAccess(
  db: Database,
  folderId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkFileFolderAccess',
    { folderId, userId },
    async () => {
      // Check if user owns the folder
      const folder = await db.query.userFileFolders.findFirst({
        where: eq(userFileFolders.id, folderId),
      });

      if (!folder) {
        return { hasAccess: false, permission: null };
      }

      if (folder.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if folder is shared with user
      const share = await db.query.fileShares.findFirst({
        where: and(
          eq(fileShares.resourceType, "file_folder"),
          eq(fileShares.resourceId, folderId),
          eq(fileShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      return { hasAccess: false, permission: null };
    }
  );
}

/**
 * Get all files and folders shared with a user
 */
export async function getFileSharedResourcesForUser(db: Database, userId: string) {
  return withQueryLogging(
    'getFileSharedResourcesForUser',
    { userId },
    async () => {
      const shares = await db.query.fileShares.findMany({
        where: eq(fileShares.sharedWithUserId, userId),
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

      // Fetch full file and folder details
      const fileIds = shares
        .filter(s => s.resourceType === "file")
        .map(s => s.resourceId);
      
      const folderIds = shares
        .filter(s => s.resourceType === "file_folder")
        .map(s => s.resourceId);

      const sharedFiles = fileIds.length > 0 
        ? await db.query.userFiles.findMany({
            where: or(...fileIds.map(id => eq(userFiles.id, id))),
            with: {
              folder: true,
            },
          })
        : [];

      const sharedFolders = folderIds.length > 0
        ? await db.query.userFileFolders.findMany({
            where: or(...folderIds.map(id => eq(userFileFolders.id, id))),
            with: {
              files: true,
            },
          })
        : [];

      return {
        files: sharedFiles.map(file => ({
          ...file,
          shareInfo: shares.find(s => s.resourceId === file.id),
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
export async function searchUsersForFileSharing(
  db: Database,
  searchTerm: string,
  currentUserId: string
) {
  return withQueryLogging(
    'searchUsersForFileSharing',
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

