import { eq, and, or, inArray, ilike, ne, isNull, isNotNull } from "drizzle-orm";
import type { Database } from "../client";
import { taskShares, notes, noteFolders, users } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Note and Folder Sharing Queries
// Note: Reusing taskShares table with resource types "note" and "note_folder"
// ============================================

/**
 * Create a new share for a note or folder
 */
export async function createNoteShare(
  db: Database,
  data: {
    ownerId: string;
    sharedWithUserId: string;
    resourceType: "note" | "note_folder";
    resourceId: string;
    permission: "view" | "edit";
  }
) {
  return withMutationLogging(
    'createNoteShare',
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
          eq(taskShares.resourceType, data.resourceType as any),
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
      const [share] = await db.insert(taskShares).values(data as any).returning();
      return share;
    }
  );
}

/**
 * Get all shares for a specific resource
 */
export async function getNoteResourceShares(
  db: Database,
  resourceType: "note" | "note_folder",
  resourceId: string,
  ownerId: string
) {
  return withQueryLogging(
    'getNoteResourceShares',
    { resourceType, resourceId, ownerId },
    () => db.query.taskShares.findMany({
      where: and(
        eq(taskShares.ownerId, ownerId),
        eq(taskShares.resourceType, resourceType as any),
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
export async function getUserNoteShares(db: Database, userId: string) {
  return withQueryLogging(
    'getUserNoteShares',
    { userId },
    () => db.query.taskShares.findMany({
      where: and(
        eq(taskShares.ownerId, userId),
        or(
          eq(taskShares.resourceType, "note" as any),
          eq(taskShares.resourceType, "note_folder" as any)
        )
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
 * Update share permission
 */
export async function updateNoteSharePermission(
  db: Database,
  shareId: string,
  ownerId: string,
  permission: "view" | "edit"
) {
  return withMutationLogging(
    'updateNoteSharePermission',
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
export async function deleteNoteShare(
  db: Database,
  shareId: string,
  ownerId: string
) {
  return withMutationLogging(
    'deleteNoteShare',
    { shareId, ownerId },
    () => db.delete(taskShares).where(and(
      eq(taskShares.id, shareId),
      eq(taskShares.ownerId, ownerId)
    ))
  );
}

/**
 * Check if user has access to a note
 */
export async function checkNoteAccess(
  db: Database,
  noteId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkNoteAccess',
    { noteId, userId },
    async () => {
      // Check if user owns the note
      const note = await db.query.notes.findFirst({
        where: eq(notes.id, noteId),
      });

      if (!note) {
        return { hasAccess: false, permission: null };
      }

      if (note.userId === userId) {
        return { hasAccess: true, permission: "owner" };
      }

      // Check if note is shared with user
      const share = await db.query.taskShares.findFirst({
        where: and(
          eq(taskShares.resourceType, "note" as any),
          eq(taskShares.resourceId, noteId),
          eq(taskShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared with user
      if (note.folderId) {
        const folderShare = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "note_folder" as any),
            eq(taskShares.resourceId, note.folderId),
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
export async function checkNoteFolderAccess(
  db: Database,
  folderId: string,
  userId: string
): Promise<{ hasAccess: boolean; permission: "view" | "edit" | "owner" | null }> {
  return withQueryLogging(
    'checkNoteFolderAccess',
    { folderId, userId },
    async () => {
      // Check if user owns the folder
      const folder = await db.query.noteFolders.findFirst({
        where: eq(noteFolders.id, folderId),
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
          eq(taskShares.resourceType, "note_folder" as any),
          eq(taskShares.resourceId, folderId),
          eq(taskShares.sharedWithUserId, userId)
        ),
      });

      if (share) {
        return { hasAccess: true, permission: share.permission };
      }

      // Check if parent folder is shared (recursive check)
      if (folder.parentId) {
        return checkNoteFolderAccess(db, folder.parentId, userId);
      }

      return { hasAccess: false, permission: null };
    }
  );
}

/**
 * Get all notes and folders shared with a user
 */
export async function getSharedNotesForUser(db: Database, userId: string) {
  return withQueryLogging(
    'getSharedNotesForUser',
    { userId },
    async () => {
      const shares = await db.query.taskShares.findMany({
        where: and(
          eq(taskShares.sharedWithUserId, userId),
          or(
            eq(taskShares.resourceType, "note" as any),
            eq(taskShares.resourceType, "note_folder" as any)
          )
        ),
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

      // Fetch full note and folder details
      const noteIds = shares
        .filter(s => s.resourceType === "note")
        .map(s => s.resourceId);
      
      const folderIds = shares
        .filter(s => s.resourceType === "note_folder")
        .map(s => s.resourceId);

      const sharedNotes = noteIds.length > 0 
        ? await db.query.notes.findMany({
            where: inArray(notes.id, noteIds),
            with: {
              folder: true,
            },
          })
        : [];

      const sharedFolders = folderIds.length > 0
        ? await db.query.noteFolders.findMany({
            where: inArray(noteFolders.id, folderIds),
            with: {
              notes: true,
              subfolders: true,
            },
          })
        : [];

      return {
        notes: sharedNotes.map(note => ({
          ...note,
          shareInfo: shares.find(s => s.resourceId === note.id),
        })),
        folders: sharedFolders.map(folder => ({
          ...folder,
          shareInfo: shares.find(s => s.resourceId === folder.id),
        })),
      };
    }
  );
}

