import { eq, and, or, ilike, ne, isNull, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import { addressShares, addresses, addressFolders, users } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Address and Folder Sharing Queries
// ============================================

/**
 * Create a new share for an address or folder
 */
export async function createAddressShare(
  db: Database,
  data: {
    ownerId: string;
    sharedWithUserId: string;
    resourceType: "address" | "address_folder";
    resourceId: string;
    permission: "view" | "edit";
  }
) {
  return withMutationLogging(
    'createAddressShare',
    { 
      ownerId: data.ownerId, 
      sharedWithUserId: data.sharedWithUserId,
      resourceType: data.resourceType,
      resourceId: data.resourceId 
    },
    async () => {
      // Check if share already exists and update it if so
      const existingShare = await db.query.addressShares.findFirst({
        where: and(
          eq(addressShares.ownerId, data.ownerId),
          eq(addressShares.sharedWithUserId, data.sharedWithUserId),
          eq(addressShares.resourceType, data.resourceType),
          eq(addressShares.resourceId, data.resourceId)
        ),
      });

      if (existingShare) {
        // Update existing share
        const [updated] = await db
          .update(addressShares)
          .set({ 
            permission: data.permission,
            updatedAt: new Date() 
          })
          .where(eq(addressShares.id, existingShare.id))
          .returning();
        return updated;
      }

      // Create new share
      const [share] = await db.insert(addressShares).values(data).returning();
      return share;
    }
  );
}

/**
 * Get all shares for a specific resource
 */
export async function getAddressResourceShares(
  db: Database,
  resourceType: "address" | "address_folder",
  resourceId: string,
  ownerId: string
) {
  return withQueryLogging(
    'getAddressResourceShares',
    { resourceType, resourceId, ownerId },
    async () => {
      return db.query.addressShares.findMany({
        where: and(
          eq(addressShares.ownerId, ownerId),
          eq(addressShares.resourceType, resourceType),
          eq(addressShares.resourceId, resourceId)
        ),
        with: {
          sharedWithUser: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: [addressShares.sharedAt],
      });
    }
  );
}

/**
 * Get all shares given by a user
 */
export async function getAddressSharesGiven(db: Database, userId: string) {
  return withQueryLogging(
    'getAddressSharesGiven',
    { userId },
    async () => {
      return db.query.addressShares.findMany({
        where: eq(addressShares.ownerId, userId),
        with: {
          sharedWithUser: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });
    }
  );
}

/**
 * Get all addresses and folders shared with a user
 */
export async function getAddressSharedWithMe(db: Database, userId: string) {
  return withQueryLogging(
    'getAddressSharedWithMe',
    { userId },
    async () => {
      const shares = await db.query.addressShares.findMany({
        where: eq(addressShares.sharedWithUserId, userId),
        with: {
          owner: {
            columns: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      const addressesList: any[] = [];
      const foldersList: any[] = [];

      for (const share of shares) {
        if (share.resourceType === "address") {
          const address = await db.query.addresses.findFirst({
            where: eq(addresses.id, share.resourceId),
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
          if (address) {
            addressesList.push({
              ...address,
              isSharedWithMe: true,
              sharePermission: share.permission,
              ownerId: share.ownerId,
              shareInfo: {
                ownerId: share.ownerId,
                permission: share.permission,
                sharedAt: share.sharedAt,
                owner: share.owner,
              },
            });
          }
        } else if (share.resourceType === "address_folder") {
          const folder = await db.query.addressFolders.findFirst({
            where: eq(addressFolders.id, share.resourceId),
            with: {
              addresses: {
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
              },
            },
          });
          if (folder) {
            foldersList.push({
              ...folder,
              isSharedWithMe: true,
              sharePermission: share.permission,
              ownerId: share.ownerId,
              shareInfo: {
                ownerId: share.ownerId,
                permission: share.permission,
                sharedAt: share.sharedAt,
                owner: share.owner,
              },
            });
          }
        }
      }

      return {
        addresses: addressesList,
        folders: foldersList,
      };
    }
  );
}

/**
 * Update share permission
 */
export async function updateAddressSharePermission(
  db: Database,
  shareId: string,
  ownerId: string,
  permission: "view" | "edit"
) {
  return withMutationLogging(
    'updateAddressSharePermission',
    { shareId, ownerId, permission },
    async () => {
      const [share] = await db
        .update(addressShares)
        .set({ 
          permission,
          updatedAt: new Date() 
        })
        .where(and(
          eq(addressShares.id, shareId),
          eq(addressShares.ownerId, ownerId)
        ))
        .returning();
      return share;
    }
  );
}

/**
 * Delete a share
 */
export async function deleteAddressShare(
  db: Database,
  shareId: string,
  ownerId: string
) {
  return withMutationLogging(
    'deleteAddressShare',
    { shareId, ownerId },
    async () => {
      const [share] = await db
        .delete(addressShares)
        .where(and(
          eq(addressShares.id, shareId),
          eq(addressShares.ownerId, ownerId)
        ))
        .returning();
      return share;
    }
  );
}

/**
 * Check if user has access to an address
 */
export async function checkAddressAccess(
  db: Database,
  addressId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkAddressAccess',
    { addressId, userId },
    async () => {
      // Check if user owns the address
      const address = await db.query.addresses.findFirst({
        where: eq(addresses.id, addressId),
      });

      if (!address) {
        return { hasAccess: false, permission: null };
      }

      if (address.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if address is shared with user
      const share = await db.query.addressShares.findFirst({
        where: and(
          eq(addressShares.resourceType, "address"),
          eq(addressShares.resourceId, addressId),
          eq(addressShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared with user
      if (address.folderId) {
        const folderShare = await db.query.addressShares.findFirst({
          where: and(
            eq(addressShares.resourceType, "address_folder"),
            eq(addressShares.resourceId, address.folderId),
            eq(addressShares.sharedWithUserId, userId)
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
export async function checkAddressFolderAccess(
  db: Database,
  folderId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkAddressFolderAccess',
    { folderId, userId },
    async () => {
      // Check if user owns the folder
      const folder = await db.query.addressFolders.findFirst({
        where: eq(addressFolders.id, folderId),
      });

      if (!folder) {
        return { hasAccess: false, permission: null };
      }

      if (folder.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if folder is shared with user
      const share = await db.query.addressShares.findFirst({
        where: and(
          eq(addressShares.resourceType, "address_folder"),
          eq(addressShares.resourceId, folderId),
          eq(addressShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      return { hasAccess: false, permission: null };
    }
  );
}

