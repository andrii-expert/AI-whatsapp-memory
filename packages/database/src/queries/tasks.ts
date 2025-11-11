import { eq, and, desc, asc, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { tasks, taskFolders } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Task Folders
// ============================================

export async function getUserFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFolders',
    { userId },
    () => db.query.taskFolders.findMany({
      where: and(
        eq(taskFolders.userId, userId),
        isNull(taskFolders.parentId)
      ),
      orderBy: [asc(taskFolders.sortOrder), asc(taskFolders.createdAt)],
      with: {
        subfolders: {
          orderBy: [asc(taskFolders.sortOrder), asc(taskFolders.createdAt)],
          with: {
            subfolders: {
              orderBy: [asc(taskFolders.sortOrder), asc(taskFolders.createdAt)],
              with: {
                tasks: {
                  orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
                },
              },
            },
            tasks: {
              orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
            },
          },
        },
        tasks: {
          orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
        },
      },
    })
  );
}

export async function getFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getFolderById',
    { folderId, userId },
    () => db.query.taskFolders.findFirst({
      where: and(
        eq(taskFolders.id, folderId),
        eq(taskFolders.userId, userId)
      ),
      with: {
        parent: true,
        subfolders: {
          orderBy: [asc(taskFolders.sortOrder), asc(taskFolders.createdAt)],
          with: {
            tasks: {
              orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
            },
          },
        },
        tasks: {
          orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
        },
      },
    })
  );
}

export async function createFolder(
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
    'createFolder',
    { userId: data.userId, name: data.name, parentId: data.parentId },
    async () => {
      const [folder] = await db.insert(taskFolders).values(data).returning();
      return folder;
    }
  );
}

export async function updateFolder(
  db: Database,
  folderId: string,
  userId: string,
  data: {
    name?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateFolder',
    { folderId, userId },
    async () => {
      const [folder] = await db
        .update(taskFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(and(
          eq(taskFolders.id, folderId),
          eq(taskFolders.userId, userId)
        ))
        .returning();
      return folder;
    }
  );
}

export async function deleteFolder(db: Database, folderId: string, userId: string) {
  return withMutationLogging(
    'deleteFolder',
    { folderId, userId },
    () => db.delete(taskFolders).where(and(
      eq(taskFolders.id, folderId),
      eq(taskFolders.userId, userId)
    ))
  );
}

// ============================================
// Tasks
// ============================================

export async function getUserTasks(
  db: Database,
  userId: string,
  options?: {
    folderId?: string;
    status?: "open" | "completed" | "archived";
  }
) {
  return withQueryLogging(
    'getUserTasks',
    { userId, ...options },
    () => {
      const conditions = [eq(tasks.userId, userId)];
      
      if (options?.folderId) {
        conditions.push(eq(tasks.folderId, options.folderId));
      }
      
      if (options?.status) {
        conditions.push(eq(tasks.status, options.status));
      }
      
      return db.query.tasks.findMany({
        where: and(...conditions),
        orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
        with: {
          folder: true,
        },
      });
    }
  );
}

export async function getTaskById(db: Database, taskId: string, userId: string) {
  return withQueryLogging(
    'getTaskById',
    { taskId, userId },
    () => db.query.tasks.findFirst({
      where: and(
        eq(tasks.id, taskId),
        eq(tasks.userId, userId)
      ),
      with: {
        folder: true,
      },
    })
  );
}

export async function createTask(
  db: Database,
  data: {
    userId: string;
    folderId?: string;
    title: string;
    description?: string;
    dueDate?: string; // YYYY-MM-DD format
    status?: "open" | "completed" | "archived";
  }
) {
  return withMutationLogging(
    'createTask',
    { userId: data.userId, title: data.title },
    async () => {
      const [task] = await db.insert(tasks).values(data).returning();
      return task;
    }
  );
}

export async function updateTask(
  db: Database,
  taskId: string,
  userId: string,
  data: {
    title?: string;
    description?: string;
    folderId?: string | null;
    dueDate?: string | null; // YYYY-MM-DD format
    status?: "open" | "completed" | "archived";
    sortOrder?: number;
  }
) {
  return withMutationLogging(
    'updateTask',
    { taskId, userId },
    async () => {
      const updateData: any = { ...data, updatedAt: new Date() };
      
      // Handle status change to completed
      if (data.status === "completed") {
        updateData.completedAt = new Date();
      } else if (data.status === "open" && data.status !== undefined) {
        updateData.completedAt = null;
      }
      
      const [task] = await db
        .update(tasks)
        .set(updateData)
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId)
        ))
        .returning();
      return task;
    }
  );
}

export async function deleteTask(db: Database, taskId: string, userId: string) {
  return withMutationLogging(
    'deleteTask',
    { taskId, userId },
    () => db.delete(tasks).where(and(
      eq(tasks.id, taskId),
      eq(tasks.userId, userId)
    ))
  );
}

export async function toggleTaskStatus(db: Database, taskId: string, userId: string) {
  return withMutationLogging(
    'toggleTaskStatus',
    { taskId, userId },
    async () => {
      const task = await getTaskById(db, taskId, userId);
      
      if (!task) {
        throw new Error("Task not found");
      }
      
      const newStatus = task.status === "completed" ? "open" : "completed";
      const completedAt = newStatus === "completed" ? new Date() : null;
      
      const [updatedTask] = await db
        .update(tasks)
        .set({
          status: newStatus,
          completedAt,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tasks.id, taskId),
          eq(tasks.userId, userId)
        ))
        .returning();
      
      return updatedTask;
    }
  );
}

