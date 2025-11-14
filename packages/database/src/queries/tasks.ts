import { eq, and, desc, asc, isNull, or, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { tasks, taskFolders, taskShares } from "../schema";
import { withQueryLogging, withMutationLogging } from "../utils/query-logger";

// ============================================
// Task Folders
// ============================================

export async function getUserFolders(db: Database, userId: string) {
  return withQueryLogging(
    'getUserFolders',
    { userId },
    async () => {
      // Get folders owned by user
      const ownedFolders = await db.query.taskFolders.findMany({
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
      });

      // Get folders shared with user (with permission info)
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
            eq(taskShares.resourceType, "task_folder")
          )
        );

      let sharedFolders: any[] = [];
      if (sharedFolderData.length > 0) {
        const folderIds = sharedFolderData.map(s => s.folderId);
        const folders = await db.query.taskFolders.findMany({
          where: and(
            inArray(taskFolders.id, folderIds),
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
        });

        // Add share metadata to folders
        sharedFolders = folders.map(folder => {
          const shareData = sharedFolderData.find(s => s.folderId === folder.id);
          return {
            ...folder,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
          };
        });
      }

      return [...ownedFolders, ...sharedFolders];
    }
  );
}

export async function getFolderById(db: Database, folderId: string, userId: string) {
  return withQueryLogging(
    'getFolderById',
    { folderId, userId },
    async () => {
      // Get the folder
      const folder = await db.query.taskFolders.findFirst({
        where: eq(taskFolders.id, folderId),
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
      });

      if (!folder) {
        return null;
      }

      // Check if user owns it
      if (folder.userId === userId) {
        return folder;
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
        return {
          ...folder,
          isSharedWithMe: true,
          sharePermission: share.permission,
        };
      }

      // Check if parent folder is shared
      if (folder.parentId) {
        const parentShare = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task_folder"),
            eq(taskShares.resourceId, folder.parentId),
            eq(taskShares.sharedWithUserId, userId)
          ),
        });

        if (parentShare) {
          return {
            ...folder,
            isSharedWithMe: true,
            sharePermission: parentShare.permission,
            sharedViaParent: true,
          };
        }
      }

      // User has no access
      return null;
    }
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
      // If creating a subfolder, check if user has access to parent
      if (data.parentId) {
        const parentFolder = await db.query.taskFolders.findFirst({
          where: eq(taskFolders.id, data.parentId),
        });

        if (parentFolder) {
          const isOwner = parentFolder.userId === data.userId;

          // If not owner, check if parent folder is shared with edit permission
          if (!isOwner) {
            const share = await db.query.taskShares.findFirst({
              where: and(
                eq(taskShares.resourceType, "task_folder"),
                eq(taskShares.resourceId, data.parentId),
                eq(taskShares.sharedWithUserId, data.userId),
                eq(taskShares.permission, "edit")
              ),
            });

            if (!share) {
              throw new Error("No permission to create subfolders in this folder");
            }
          }
        }
      }

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
      // First check if user owns the folder
      const folder = await db.query.taskFolders.findFirst({
        where: eq(taskFolders.id, folderId),
      });

      if (!folder) {
        throw new Error("Folder not found");
      }

      // If user owns the folder, allow update
      const isOwner = folder.userId === userId;

      // If not owner, check if folder is shared with edit permission
      if (!isOwner) {
        const share = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task_folder"),
            eq(taskShares.resourceId, folderId),
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.permission, "edit")
          ),
        });

        // If no direct folder share, check parent folder share
        if (!share && folder.parentId) {
          const parentShare = await db.query.taskShares.findFirst({
            where: and(
              eq(taskShares.resourceType, "task_folder"),
              eq(taskShares.resourceId, folder.parentId),
              eq(taskShares.sharedWithUserId, userId),
              eq(taskShares.permission, "edit")
            ),
          });

          if (!parentShare) {
            throw new Error("No edit permission for this folder");
          }
        } else if (!share) {
          throw new Error("No edit permission for this folder");
        }
      }

      const [updatedFolder] = await db
        .update(taskFolders)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(taskFolders.id, folderId))
        .returning();
      return updatedFolder;
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
    async () => {
      // Build conditions for owned tasks
      const ownedConditions = [eq(tasks.userId, userId)];
      
      if (options?.folderId) {
        ownedConditions.push(eq(tasks.folderId, options.folderId));
      }
      
      if (options?.status) {
        ownedConditions.push(eq(tasks.status, options.status));
      }
      
      // Get owned tasks
      const ownedTasks = await db.query.tasks.findMany({
        where: and(...ownedConditions),
        orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
        with: {
          folder: true,
        },
      });

      // Get shared tasks (with permission info)
      const sharedTaskData = await db
        .select({ 
          taskId: taskShares.resourceId,
          permission: taskShares.permission,
          ownerId: taskShares.ownerId,
        })
        .from(taskShares)
        .where(
          and(
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.resourceType, "task")
          )
        );

      let sharedTasks: any[] = [];
      if (sharedTaskData.length > 0) {
        const taskIds = sharedTaskData.map(s => s.taskId);
        const sharedConditions: any[] = [inArray(tasks.id, taskIds)];
        
        if (options?.folderId) {
          sharedConditions.push(eq(tasks.folderId, options.folderId));
        }
        
        if (options?.status) {
          sharedConditions.push(eq(tasks.status, options.status));
        }

        const fetchedTasks = await db.query.tasks.findMany({
          where: and(...sharedConditions),
          orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
          with: {
            folder: true,
          },
        });

        // Add share metadata
        sharedTasks = fetchedTasks.map(task => {
          const shareData = sharedTaskData.find(s => s.taskId === task.id);
          return {
            ...task,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
          };
        });
      }

      // Get tasks from shared folders (with permission info)
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
            eq(taskShares.resourceType, "task_folder")
          )
        );

      let tasksFromSharedFolders: any[] = [];
      if (sharedFolderData.length > 0) {
        const folderIds = sharedFolderData.map(s => s.folderId);
        const folderTaskConditions: any[] = [inArray(tasks.folderId, folderIds)];
        
        if (options?.status) {
          folderTaskConditions.push(eq(tasks.status, options.status));
        }

        const fetchedTasks = await db.query.tasks.findMany({
          where: and(...folderTaskConditions),
          orderBy: [asc(tasks.sortOrder), desc(tasks.createdAt)],
          with: {
            folder: true,
          },
        });

        // Add share metadata from parent folder
        tasksFromSharedFolders = fetchedTasks.map(task => {
          const shareData = sharedFolderData.find(s => s.folderId === task.folderId);
          return {
            ...task,
            isSharedWithMe: true,
            sharePermission: shareData?.permission || "view",
            sharedByUserId: shareData?.ownerId,
            sharedViaFolder: true,
          };
        });
      }

      // Combine and deduplicate tasks
      const allTasks = [...ownedTasks, ...sharedTasks, ...tasksFromSharedFolders];
      const uniqueTasks = Array.from(
        new Map(allTasks.map(task => [task.id, task])).values()
      );

      return uniqueTasks;
    }
  );
}

export async function getTaskById(db: Database, taskId: string, userId: string) {
  return withQueryLogging(
    'getTaskById',
    { taskId, userId },
    async () => {
      // Get the task
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
        with: {
          folder: true,
        },
      });

      if (!task) {
        return null;
      }

      // Check if user owns it
      if (task.userId === userId) {
        return task;
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
        return {
          ...task,
          isSharedWithMe: true,
          sharePermission: share.permission,
        };
      }

      // Check if folder is shared with user
      if (task.folderId) {
        const folderShare = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task_folder"),
            eq(taskShares.resourceId, task.folderId),
            eq(taskShares.sharedWithUserId, userId)
          ),
        });

        if (folderShare) {
          return {
            ...task,
            isSharedWithMe: true,
            sharePermission: folderShare.permission,
            sharedViaFolder: true,
          };
        }
      }

      // User has no access
      return null;
    }
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
      // If adding to a folder, check if user has access
      if (data.folderId) {
        const folder = await db.query.taskFolders.findFirst({
          where: eq(taskFolders.id, data.folderId),
        });

        if (folder) {
          const isOwner = folder.userId === data.userId;

          // If not owner, check if folder is shared with edit permission
          if (!isOwner) {
            const share = await db.query.taskShares.findFirst({
              where: and(
                eq(taskShares.resourceType, "task_folder"),
                eq(taskShares.resourceId, data.folderId),
                eq(taskShares.sharedWithUserId, data.userId),
                eq(taskShares.permission, "edit")
              ),
            });

            if (!share) {
              throw new Error("No permission to add tasks to this folder");
            }
          }
        }
      }

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
      // First check if user owns the task
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
      });

      if (!task) {
        throw new Error("Task not found");
      }

      // If user owns the task, allow update
      const isOwner = task.userId === userId;

      // If not owner, check if task is shared with edit permission
      if (!isOwner) {
        const share = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task"),
            eq(taskShares.resourceId, taskId),
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.permission, "edit")
          ),
        });

        // If no direct task share, check folder share
        if (!share && task.folderId) {
          const folderShare = await db.query.taskShares.findFirst({
            where: and(
              eq(taskShares.resourceType, "task_folder"),
              eq(taskShares.resourceId, task.folderId),
              eq(taskShares.sharedWithUserId, userId),
              eq(taskShares.permission, "edit")
            ),
          });

          if (!folderShare) {
            throw new Error("No edit permission for this task");
          }
        } else if (!share) {
          throw new Error("No edit permission for this task");
        }
      }

      const updateData: any = { ...data, updatedAt: new Date() };
      
      // Handle status change to completed
      if (data.status === "completed") {
        updateData.completedAt = new Date();
      } else if (data.status === "open" && data.status !== undefined) {
        updateData.completedAt = null;
      }
      
      const [updatedTask] = await db
        .update(tasks)
        .set(updateData)
        .where(eq(tasks.id, taskId))
        .returning();
      return updatedTask;
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
      // Get the task without ownership check
      const task = await db.query.tasks.findFirst({
        where: eq(tasks.id, taskId),
      });
      
      if (!task) {
        throw new Error("Task not found");
      }

      // Check if user owns the task or has edit permission
      const isOwner = task.userId === userId;

      if (!isOwner) {
        // Check if task is shared with edit permission
        const share = await db.query.taskShares.findFirst({
          where: and(
            eq(taskShares.resourceType, "task"),
            eq(taskShares.resourceId, taskId),
            eq(taskShares.sharedWithUserId, userId),
            eq(taskShares.permission, "edit")
          ),
        });

        // If no direct task share, check folder share
        if (!share && task.folderId) {
          const folderShare = await db.query.taskShares.findFirst({
            where: and(
              eq(taskShares.resourceType, "task_folder"),
              eq(taskShares.resourceId, task.folderId),
              eq(taskShares.sharedWithUserId, userId),
              eq(taskShares.permission, "edit")
            ),
          });

          if (!folderShare) {
            throw new Error("No edit permission for this task");
          }
        } else if (!share) {
          throw new Error("No edit permission for this task");
        }
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
        .where(eq(tasks.id, taskId))
        .returning();
      
      return updatedTask;
    }
  );
}

