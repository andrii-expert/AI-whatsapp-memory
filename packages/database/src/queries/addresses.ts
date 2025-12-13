import { eq, and, or, ilike, isNull, desc, asc, ne } from "drizzle-orm";
import type { Database } from "../client";
import { addresses, addressFolders, users } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Address Folders
// ============================================

/**
 * Get all address folders for a user
 */
export async function getUserAddressFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserAddressFolders',
    { userId },
    async () => {
      return db.query.addressFolders.findMany({
        where: eq(addressFolders.userId, userId),
        orderBy: [asc(addressFolders.name)],
      });
    }
  );
}

/**
 * Get address folder by ID
 */
export async function getAddressFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getAddressFolderById',
    { folderId, userId },
    async () => {
      return db.query.addressFolders.findFirst({
        where: and(
          eq(addressFolders.id, folderId),
          eq(addressFolders.userId, userId)
        ),
      });
    }
  );
}

/**
 * Create a new address folder
 */
export async function createAddressFolder(
  db: Database,
  data: {
    userId: string;
    name: string;
  }
) {
  return withMutationLogging(
    'createAddressFolder',
    { userId: data.userId, name: data.name },
    async () => {
      const [folder] = await db.insert(addressFolders).values(data).returning();
      return folder;
    }
  );
}

/**
 * Update address folder
 */
export async function updateAddressFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: {
    name?: string;
  }
) {
  return withMutationLogging(
    'updateAddressFolder',
    { folderId, userId, ...data },
    async () => {
      const [folder] = await db
        .update(addressFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(addressFolders.id, folderId),
          eq(addressFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

/**
 * Delete address folder
 */
export async function deleteAddressFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'deleteAddressFolder',
    { folderId, userId },
    async () => {
      // Set folderId to null for all addresses in this folder
      await db
        .update(addresses)
        .set({ folderId: null, updatedAt: new Date() })
        .where(eq(addresses.folderId, folderId));

      // Delete the folder
      const [folder] = await db
        .delete(addressFolders)
        .where(and(
          eq(addressFolders.id, folderId),
          eq(addressFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

// ============================================
// Addresses
// ============================================

/**
 * Get all addresses for a user
 */
export async function getUserAddresses(db: Database, userId: string) {
  return withQueryLogging(
    'getUserAddresses',
    { userId },
    async () => {
      return db.query.addresses.findMany({
        where: eq(addresses.userId, userId),
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
        orderBy: [asc(addresses.name)],
      });
    }
  );
}

/**
 * Get address by ID
 */
export async function getAddressById(db: Database, addressId: string, userId: string) {
  return withQueryLogging(
    'getAddressById',
    { addressId, userId },
    async () => {
      return db.query.addresses.findFirst({
        where: and(
          eq(addresses.id, addressId),
          eq(addresses.userId, userId)
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
 * Create a new address
 */
export async function createAddress(
  db: Database,
  data: {
    userId: string;
    name: string;
    folderId?: string | null;
    connectedUserId?: string | null;
  }
) {
  return withMutationLogging(
    'createAddress',
    { userId: data.userId, name: data.name },
    async () => {
      const [address] = await db.insert(addresses).values(data).returning();
      return address;
    }
  );
}

/**
 * Update address
 */
export async function updateAddress(
  db: Database,
  addressId: string,
  userId: string,
  data: {
    name?: string;
    folderId?: string | null;
    connectedUserId?: string | null;
  }
) {
  return withMutationLogging(
    'updateAddress',
    { addressId, userId, ...data },
    async () => {
      const [address] = await db
        .update(addresses)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(addresses.id, addressId),
          eq(addresses.userId, userId)
        ))
        .returning();
      return address;
    }
  );
}

/**
 * Delete address
 */
export async function deleteAddress(db: Database, addressId: string, userId: string) {
  return withMutationLogging(
    'deleteAddress',
    { addressId, userId },
    async () => {
      const [address] = await db
        .delete(addresses)
        .where(and(
          eq(addresses.id, addressId),
          eq(addresses.userId, userId)
        ))
        .returning();
      return address;
    }
  );
}

/**
 * Search users by email or phone
 */
export async function searchUsersByEmailOrPhone(
  db: Database,
  searchTerm: string,
  excludeUserId?: string
) {
  return withQueryLogging(
    'searchUsersByEmailOrPhone',
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

