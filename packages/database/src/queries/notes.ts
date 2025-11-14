import { eq, and, desc, asc, isNull, inArray, or } from "drizzle-orm";
import type { Database } from "../client";
import { notes, noteFolders, taskShares } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Note Folders
// ============================================

export async function getUserNoteFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserNoteFolders',
    { userId },
    async () => {
      // Get owned folders
      const ownedFolders = await db.query.noteFolders.findMany({
        where: and(
          eq(noteFolders.userId, userId),
          isNull(noteFolders.parentId)
        ),
        orderBy: [asc(noteFolders.sortOrder), asc(noteFolders.createdAt)],
        with: {
          subfolders: {
            orderBy: [asc(noteFolders.sortOrder), asc(noteFolders.createdAt)],
            with: {
              notes: {
                orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
              },
            },
          },
          notes: {
            orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
          },
        },
      });

      // Get shared folders (only top-level ones)
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
            eq(taskShares.resourceType, "note_folder" as any)
          )
        );

      let sharedFolders: any[] = [];
      if (sharedFolderData.length > 0) {
        const folderIds = sharedFolderData.map(s => s.folderId);
        const fetchedFolders = await db.query.noteFolders.findMany({
          where: and(
            inArray(noteFolders.id, folderIds),
            isNull(noteFolders.parentId) // Only top-level shared folders
          ),
          orderBy: [asc(noteFolders.sortOrder), asc(noteFolders.createdAt)],
          with: {
            subfolders: {
              orderBy: [asc(noteFolders.sortOrder), asc(noteFolders.createdAt)],
              with: {
                notes: {
                  orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
                },
              },
            },
            notes: {
              orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
            },
          },
        });

        // Add share metadata
        sharedFolders = fetchedFolders.map(folder => {
          const shareData = sharedFolderData.find(s => s.folderId === folder.id);
          return {
            ...folder,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
          };
        });
      }

      // Combine owned and shared folders
      return [...ownedFolders, ...sharedFolders];
    }
  );
}

export async function getNoteFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getNoteFolderById',
    { folderId, userId },
    () => db.query.noteFolders.findFirst({
      where: and(
        eq(noteFolders.id, folderId),
        eq(noteFolders.userId, userId)
      ),
      with: {
        parent: true,
        subfolders: {
          orderBy: [asc(noteFolders.sortOrder), asc(noteFolders.createdAt)],
          with: {
            notes: {
              orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
            },
          },
        },
        notes: {
          orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
        },
      },
    })
  );
}

export async function createNoteFolder(
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
    'createNoteFolder',
    { userId: data.userId, name: data.name, parentId: data.parentId },
    async () => {
      const [folder] = await db.insert(noteFolders).values(data).returning();
      return folder;
    }
  );
}

export async function updateNoteFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: {
    name?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
    sharedWith?: string[];
  }
) {
  return withMutationLogging(
    'updateNoteFolder',
    { folderId, userId },
    async () => {
      const [folder] = await db
        .update(noteFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(noteFolders.id, folderId),
          eq(noteFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

export async function deleteNoteFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'deleteNoteFolder',
    { folderId, userId },
    () => db.delete(noteFolders).where(and(
      eq(noteFolders.id, folderId),
      eq(noteFolders.userId, userId)
    ))
  );
}

// ============================================
// Notes
// ============================================

export async function getUserNotes(
  db: Database,
  userId: string,
  options?: {
    folderId?: string;
  }
) {
  return withQueryLogging(
    'getUserNotes',
    { userId, ...options },
    async () => {
      // Get owned notes
      const ownedConditions = [eq(notes.userId, userId)];
      
      if (options?.folderId) {
        ownedConditions.push(eq(notes.folderId, options.folderId));
      }
      
      const ownedNotes = await db.query.notes.findMany({
        where: and(...ownedConditions),
        orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
        with: {
          folder: true,
        },
      });

      // Get shared notes (with permission info)
      const sharedNoteData = await db
        .select({ 
          noteId: taskShares.resourceId,
          permission: taskShares.permission,
          ownerId: taskShares.ownerId,
        })
        .from(taskShares)
        .where(
          and(
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.resourceType, "note" as any)
          )
        );

      let sharedNotes: any[] = [];
      if (sharedNoteData.length > 0) {
        const noteIds = sharedNoteData.map(s => s.noteId);
        const sharedConditions: any[] = [inArray(notes.id, noteIds)];
        
        if (options?.folderId) {
          sharedConditions.push(eq(notes.folderId, options.folderId));
        }

        const fetchedNotes = await db.query.notes.findMany({
          where: and(...sharedConditions),
          orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
          with: {
            folder: true,
          },
        });

        // Add share metadata
        sharedNotes = fetchedNotes.map(note => {
          const shareData = sharedNoteData.find(s => s.noteId === note.id);
          return {
            ...note,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
          };
        });
      }

      // Get notes from shared folders (with permission info)
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
            eq(taskShares.resourceType, "note_folder" as any)
          )
        );

      let notesFromSharedFolders: any[] = [];
      if (sharedFolderData.length > 0) {
        const folderIds = sharedFolderData.map(s => s.folderId);
        const folderNoteConditions: any[] = [inArray(notes.folderId, folderIds)];

        const fetchedNotes = await db.query.notes.findMany({
          where: and(...folderNoteConditions),
          orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
          with: {
            folder: true,
          },
        });

        // Add share metadata from parent folder
        notesFromSharedFolders = fetchedNotes.map(note => {
          const shareData = sharedFolderData.find(s => s.folderId === note.folderId);
          return {
            ...note,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
            sharedViaFolder: true,
          };
        });
      }

      // Combine and deduplicate notes
      const allNotes = [...ownedNotes, ...sharedNotes, ...notesFromSharedFolders];
      const uniqueNotes = Array.from(
        new Map(allNotes.map(note => [note.id, note])).values()
      );

      return uniqueNotes;
    }
  );
}

export async function getNoteById(db: Database, noteId: string, userId: string) {
  return withQueryLogging(
    'getNoteById',
    { noteId, userId },
    () => db.query.notes.findFirst({
      where: and(
        eq(notes.id, noteId),
        eq(notes.userId, userId)
      ),
      with: {
        folder: true,
      },
    })
  );
}

export async function createNote(
  db: Database,
  data: {
    userId: string;
    folderId?: string;
    title: string;
    content?: string;
  }
) {
  return withMutationLogging(
    'createNote',
    { userId: data.userId, title: data.title },
    async () => {
      const [note] = await db.insert(notes).values(data).returning();
      return note;
    }
  );
}

export async function updateNote(
  db: Database,
  noteId: string,
  userId: string,
  data: {
    title?: string;
    content?: string;
    folderId?: string | null;
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateNote',
    { noteId, userId },
    async () => {
      const [note] = await db
        .update(notes)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(notes.id, noteId),
          eq(notes.userId, userId)
        ))
        .returning();
      return note;
    }
  );
}

export async function deleteNote(db: Database, noteId: string, userId: string) {
  return withMutationLogging(
    'deleteNote',
    { noteId, userId },
    () => db.delete(notes).where(and(
      eq(notes.id, noteId),
      eq(notes.userId, userId)
    ))
  );
}

