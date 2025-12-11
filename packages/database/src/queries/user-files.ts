import { eq, and, desc, asc } from "drizzle-orm";
import type { Database } from "../client";
import { userFiles } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// User Files Queries
// ============================================

export async function getUserFiles(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFiles',
    { userId },
    async () => {
      return db.query.userFiles.findMany({
        where: eq(userFiles.userId, userId),
        orderBy: [desc(userFiles.createdAt)],
      });
    }
  );
}

export async function getUserFileById(db: Database, fileId: string, userId: string) {
  return withQueryLogging(
    'getUserFileById',
    { fileId, userId },
    async () => {
      return db.query.userFiles.findFirst({
        where: and(
          eq(userFiles.id, fileId),
          eq(userFiles.userId, userId)
        ),
      });
    }
  );
}

export async function createUserFile(
  db: Database,
  data: {
    userId: string;
    title: string;
    description?: string;
    folderId?: string | null;
    fileName: string;
    fileType: string;
    fileSize: number;
    fileExtension?: string;
    cloudflareId: string;
    cloudflareKey?: string;
    cloudflareUrl: string;
    thumbnailUrl?: string;
  }
) {
  return withMutationLogging(
    'createUserFile',
    { userId: data.userId, fileName: data.fileName },
    async () => {
      const [file] = await db.insert(userFiles).values(data).returning();
      return file;
    }
  );
}

export async function updateUserFile(
  db: Database,
  fileId: string,
  userId: string,
  data: {
    title?: string;
    description?: string;
    folderId?: string | null;
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateUserFile',
    { fileId, userId },
    async () => {
      const [file] = await db
        .update(userFiles)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(userFiles.id, fileId),
          eq(userFiles.userId, userId)
        ))
        .returning();
      return file;
    }
  );
}

export async function deleteUserFile(db: Database, fileId: string, userId: string) {
  return withMutationLogging(
    'deleteUserFile',
    { fileId, userId },
    async () => {
      // Get file info first (for Cloudflare deletion)
      const file = await db.query.userFiles.findFirst({
        where: and(
          eq(userFiles.id, fileId),
          eq(userFiles.userId, userId)
        ),
      });
      
      if (!file) {
        return null;
      }
      
      await db.delete(userFiles).where(and(
        eq(userFiles.id, fileId),
        eq(userFiles.userId, userId)
      ));
      
      return file;
    }
  );
}

export async function getUserFilesCount(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFilesCount',
    { userId },
    async () => {
      const files = await db.query.userFiles.findMany({
        where: eq(userFiles.userId, userId),
        columns: { id: true },
      });
      return files.length;
    }
  );
}

export async function getUserStorageUsed(db: Database, userId: string) {
  return withQueryLogging(
    'getUserStorageUsed',
    { userId },
    async () => {
      const files = await db.query.userFiles.findMany({
        where: eq(userFiles.userId, userId),
        columns: { fileSize: true },
      });
      return files.reduce((total, file) => total + file.fileSize, 0);
    }
  );
}

