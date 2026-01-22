import { eq, and, or, ilike, isNull, desc, asc, ne } from "drizzle-orm";
import type { Database } from "../client";
import { friends, friendFolders, users } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Friend Folders
// ============================================

/**
 * Get all friend folders for a user
 */
export async function getUserFriendFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFriendFolders',
    { userId },
    async () => {
      return db.query.friendFolders.findMany({
        where: eq(friendFolders.userId, userId),
        orderBy: [asc(friendFolders.name)],
      });
    }
  );
}

/**
 * Get friend folder by ID
 */
export async function getFriendFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getFriendFolderById',
    { folderId, userId },
    async () => {
      return db.query.friendFolders.findFirst({
        where: and(
          eq(friendFolders.id, folderId),
          eq(friendFolders.userId, userId)
        ),
      });
    }
  );
}

/**
 * Create a new friend folder
 */
export async function createFriendFolder(
  db: Database,
  data: {
    userId: string;
    name: string;
  }
) {
  return withMutationLogging(
    'createFriendFolder',
    { userId: data.userId, name: data.name },
    async () => {
      const [folder] = await db.insert(friendFolders).values(data).returning();
      return folder;
    }
  );
}

/**
 * Update friend folder
 */
export async function updateFriendFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: {
    name?: string;
  }
) {
  return withMutationLogging(
    'updateFriendFolder',
    { folderId, userId, ...data },
    async () => {
      const [folder] = await db
        .update(friendFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(friendFolders.id, folderId),
          eq(friendFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

/**
 * Delete friend folder
 */
export async function deleteFriendFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'deleteFriendFolder',
    { folderId, userId },
    async () => {
      // Set folderId to null for all friends in this folder
      await db
        .update(friends)
        .set({ folderId: null, updatedAt: new Date() })
        .where(eq(friends.folderId, folderId));

      // Delete the folder
      const [folder] = await db
        .delete(friendFolders)
        .where(and(
          eq(friendFolders.id, folderId),
          eq(friendFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

// ============================================
// Friends
// ============================================

/**
 * Get all friends for a user
 */
export async function getUserFriends(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFriends',
    { userId },
    async () => {
      return db.query.friends.findMany({
        where: eq(friends.userId, userId),
        with: {
          connectedUser: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              phone: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [asc(friends.name)],
      });
    }
  );
}

/**
 * Get friend by ID
 */
export async function getFriendById(db: Database, friendId: string, userId: string) {
  return withQueryLogging(
    'getFriendById',
    { friendId, userId },
    async () => {
      return db.query.friends.findFirst({
        where: and(
          eq(friends.id, friendId),
          eq(friends.userId, userId)
        ),
        with: {
          connectedUser: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              phone: true,
              avatarUrl: true,
            },
          },
        },
      });
    }
  );
}

/**
 * Create a new friend
 */
export async function createFriend(
  db: Database,
  data: {
    userId: string;
    name: string;
    folderId?: string | null;
    connectedUserId?: string | null;
    email?: string | null;
    phone?: string | null;
    addressType?: "home" | "office" | "parents_house" | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    tags?: string[] | null;
  }
) {
  return withMutationLogging(
    'createFriend',
    { userId: data.userId, name: data.name },
    async () => {
      // Normalize empty strings and invalid values to null as a safety net
      // Filter out empty strings from tags array and normalize to null if empty
      const normalizedTags = data.tags 
        ? data.tags.filter(tag => tag && tag.trim()).map(tag => tag.trim())
        : null;
      const finalTags = normalizedTags && normalizedTags.length > 0 ? normalizedTags : null;
      
      const normalizedData = {
        ...data,
        folderId: (data.folderId === "" || data.folderId === "uncategorized") ? null : data.folderId,
        connectedUserId: data.connectedUserId === "" ? null : data.connectedUserId,
        email: data.email === "" ? null : data.email,
        phone: data.phone === "" ? null : data.phone,
        street: data.street === "" ? null : data.street,
        city: data.city === "" ? null : data.city,
        state: data.state === "" ? null : data.state,
        zip: data.zip === "" ? null : data.zip,
        country: data.country === "" ? null : data.country,
        tags: finalTags,
      };
      
      const [friend] = await db.insert(friends).values(normalizedData).returning();
      return friend;
    }
  );
}

/**
 * Update friend
 */
export async function updateFriend(
  db: Database,
  friendId: string,
  userId: string,
  data: {
    name?: string;
    folderId?: string | null;
    connectedUserId?: string | null;
    email?: string | null;
    phone?: string | null;
    addressType?: "home" | "office" | "parents_house" | null;
    street?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    tags?: string[] | null;
  }
) {
  return withMutationLogging(
    'updateFriend',
    { friendId, userId, ...data },
    async () => {
      // Normalize empty strings to null as a safety net
      const normalizedData: {
        name?: string;
        folderId?: string | null;
        connectedUserId?: string | null;
        email?: string | null;
        phone?: string | null;
        addressType?: "home" | "office" | "parents_house" | null;
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zip?: string | null;
        country?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        tags?: string[] | null;
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };
      
      if (data.name !== undefined) {
        normalizedData.name = data.name;
      }
      if (data.folderId !== undefined) {
        normalizedData.folderId = (data.folderId === "" || data.folderId === "uncategorized") ? null : data.folderId;
      }
      if (data.connectedUserId !== undefined) {
        normalizedData.connectedUserId = data.connectedUserId === "" ? null : data.connectedUserId;
      }
      if (data.email !== undefined) {
        normalizedData.email = data.email === "" ? null : data.email;
      }
      if (data.phone !== undefined) {
        normalizedData.phone = data.phone === "" ? null : data.phone;
      }
      if (data.addressType !== undefined) {
        normalizedData.addressType = data.addressType;
      }
      if (data.street !== undefined) {
        normalizedData.street = data.street === "" ? null : data.street;
      }
      if (data.city !== undefined) {
        normalizedData.city = data.city === "" ? null : data.city;
      }
      if (data.state !== undefined) {
        normalizedData.state = data.state === "" ? null : data.state;
      }
      if (data.zip !== undefined) {
        normalizedData.zip = data.zip === "" ? null : data.zip;
      }
      if (data.country !== undefined) {
        normalizedData.country = data.country === "" ? null : data.country;
      }
      if (data.latitude !== undefined) {
        normalizedData.latitude = data.latitude;
      }
      if (data.longitude !== undefined) {
        normalizedData.longitude = data.longitude;
      }
      if (data.tags !== undefined) {
        // Filter out empty strings from tags array and normalize to null if empty
        const normalizedTags = data.tags 
          ? data.tags.filter(tag => tag && tag.trim()).map(tag => tag.trim())
          : null;
        normalizedData.tags = normalizedTags && normalizedTags.length > 0 ? normalizedTags : null;
      }
      
      const [friend] = await db
        .update(friends)
        .set(normalizedData)
        .where(and(
          eq(friends.id, friendId),
          eq(friends.userId, userId)
        ))
        .returning();
      return friend;
    }
  );
}

/**
 * Delete friend
 */
export async function deleteFriend(db: Database, friendId: string, userId: string) {
  return withMutationLogging(
    'deleteFriend',
    { friendId, userId },
    async () => {
      const [friend] = await db
        .delete(friends)
        .where(and(
          eq(friends.id, friendId),
          eq(friends.userId, userId)
        ))
        .returning();
      return friend;
    }
  );
}

/**
 * Search users by email or phone (for connecting friends)
 */
export async function searchUsersByEmailOrPhoneForFriends(
  db: Database,
  searchTerm: string,
  excludeUserId?: string
) {
  return withQueryLogging(
    'searchUsersByEmailOrPhoneForFriends',
    { searchTerm, excludeUserId },
    async () => {
      const searchLower = searchTerm.toLowerCase();
      
      const results = await db.query.users.findMany({
        where: and(
          or(
            ilike(users.email, `%${searchLower}%`),
            ilike(users.phone, `%${searchTerm}%`)
          ),
          excludeUserId ? ne(users.id, excludeUserId) : undefined
        ),
        columns: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          name: true,
          phone: true,
          avatarUrl: true,
        },
        limit: 10,
      });
      
      return results;
    }
  );
}

/**
 * Get all unique tags used by a user's friends
 */
export async function getUserFriendTags(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFriendTags',
    { userId },
    async () => {
      const allFriends = await db.query.friends.findMany({
        where: eq(friends.userId, userId),
        columns: {
          tags: true,
        },
      });
      
      // Extract unique, non-null tags from all friends' tag arrays
      const tags = new Set<string>();
      allFriends.forEach(friend => {
        if (friend.tags && Array.isArray(friend.tags)) {
          friend.tags.forEach(tag => {
            if (tag && typeof tag === 'string' && tag.trim()) {
              tags.add(tag.trim());
            }
          });
        }
      });
      
      return Array.from(tags).sort();
    }
  );
}

/**
 * Find pending friends by email (friends that were invited but haven't signed up yet)
 */
export async function findPendingFriendsByEmail(
  db: Database,
  email: string
) {
  return withQueryLogging(
    'findPendingFriendsByEmail',
    { email },
    async () => {
      const emailLower = email.toLowerCase();
      
      return db.query.friends.findMany({
        where: and(
          eq(friends.email, emailLower),
          isNull(friends.connectedUserId) // Only pending friends (not yet connected)
        ),
      });
    }
  );
}

/**
 * Link pending friends to a user when they sign up
 */
export async function linkPendingFriendsToUser(
  db: Database,
  userId: string,
  userEmail: string
) {
  return withMutationLogging(
    'linkPendingFriendsToUser',
    { userId, userEmail },
    async () => {
      const emailLower = userEmail.toLowerCase();
      
      // Find all pending friends with this email
      const pendingFriends = await findPendingFriendsByEmail(db, emailLower);
      
      if (pendingFriends.length === 0) {
        return { linked: 0 };
      }
      
      // Update all pending friends to link them to this user
      const friendIds = pendingFriends.map(f => f.id);
      
      await db
        .update(friends)
        .set({ 
          connectedUserId: userId,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(friends.email, emailLower),
            isNull(friends.connectedUserId)
          )
        );
      
      return { linked: pendingFriends.length };
    }
  );
}
