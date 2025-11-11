import { eq, and, desc, asc, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { notes, noteFolders } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Note Folders
// ============================================

export async function getUserNoteFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserNoteFolders',
    { userId },
    () => db.query.noteFolders.findMany({
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
    })
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
    () => {
      const conditions = [eq(notes.userId, userId)];
      
      if (options?.folderId) {
        conditions.push(eq(notes.folderId, options.folderId));
      }
      
      return db.query.notes.findMany({
        where: and(...conditions),
        orderBy: [asc(notes.sortOrder), desc(notes.createdAt)],
        with: {
          folder: true,
        },
      });
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

