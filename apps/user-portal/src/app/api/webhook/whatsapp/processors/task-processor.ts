// Task Processor - Handles task-related intents from WhatsApp messages

import type { Database } from '@imaginecalendar/database/client';
import {
  getUserFolders,
  createFolder,
  createTask,
  updateTask,
  deleteTask,
  toggleTaskStatus,
  getTaskById,
  getUserTasks,
  updateFolder,
} from '@imaginecalendar/database/queries';
import { createTaskShare, searchUsersForSharing } from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import type { TaskIntent } from '@imaginecalendar/ai-services';
import { logOutgoingWhatsAppMessage, isWithinFreeMessageWindow } from '@imaginecalendar/database/queries';

export async function processTaskIntent(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string
): Promise<{ success: boolean; message?: string }> {
  const whatsappService = new WhatsAppService();

  try {
    switch (intent.action) {
      case 'CREATE':
        return await handleCreateTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'UPDATE':
        return await handleUpdateTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'DELETE':
        return await handleDeleteTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'COMPLETE':
        return await handleCompleteTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'MOVE':
        return await handleMoveTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'SHARE':
        return await handleShareTask(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'FOLDER_CREATE':
        return await handleCreateFolder(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'FOLDER_RENAME':
        return await handleRenameFolder(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'FOLDER_SHARE':
        return await handleShareFolder(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      case 'QUERY':
        return await handleQueryTasks(intent, db, userId, whatsappNumberId, senderPhone, whatsappService);
      
      default:
        return { success: false, message: "I'm not sure how to handle that task action. Please try again." };
    }
  } catch (error) {
    logger.error(
      {
        error,
        intent: intent.action,
        userId,
      },
      'Error processing task intent'
    );
    return { success: false, message: "Sorry, I encountered an error processing your request. Please try again." };
  }
}

async function handleCreateTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.title) {
    return { success: false, message: "I need a task title to create a task. What would you like to name it?" };
  }

  // Get or create folder
  let folderId: string | undefined;
  if (intent.folderName) {
    const folders = await getUserFolders(db, userId);
    const folder = folders.find(f => f.name.toLowerCase() === intent.folderName!.toLowerCase());
    if (folder) {
      folderId = folder.id;
    } else {
      // Create folder if it doesn't exist
      const newFolder = await createFolder(db, {
        userId,
        name: intent.folderName,
        color: '#3B82F6',
        icon: 'folder',
      });
      folderId = newFolder.id;
    }
  } else {
    // Default to General folder
    const folders = await getUserFolders(db, userId);
    let generalFolder = folders.find(f => f.name.toLowerCase() === 'general');
    if (!generalFolder) {
      generalFolder = await createFolder(db, {
        userId,
        name: 'General',
        color: '#3B82F6',
        icon: 'folder',
      });
    }
    folderId = generalFolder.id;
  }

  const task = await createTask(db, {
    userId,
    folderId,
    title: intent.title,
    description: intent.description,
    dueDate: intent.dueDate,
    status: 'open',
  });

  const folderName = intent.folderName || 'General';
  const message = `✅ Task created: "${intent.title}"\n\nAdded to your ${folderName} folder.`;
  
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleUpdateTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.targetTaskTitle) {
    return { success: false, message: "Which task would you like to update? Please specify the task name." };
  }

  // Find the task
  const tasks = await getUserTasks(db, userId);
  const task = tasks.find(t => 
    t.title.toLowerCase().includes(intent.targetTaskTitle!.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `I couldn't find a task named "${intent.targetTaskTitle}". Please check the name and try again.` };
  }

  const updateData: any = {};
  if (intent.title) updateData.title = intent.title;
  if (intent.description !== undefined) updateData.description = intent.description;
  if (intent.dueDate) updateData.dueDate = intent.dueDate;

  await updateTask(db, task.id, userId, updateData);

  const message = `✅ Task updated: "${task.title}"${intent.title ? ` → "${intent.title}"` : ''}`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleDeleteTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.targetTaskTitle) {
    return { success: false, message: "Which task would you like to delete? Please specify the task name." };
  }

  const tasks = await getUserTasks(db, userId);
  const task = tasks.find(t => 
    t.title.toLowerCase().includes(intent.targetTaskTitle!.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `I couldn't find a task named "${intent.targetTaskTitle}". Please check the name and try again.` };
  }

  await deleteTask(db, task.id, userId);
  const message = `✅ Task deleted: "${task.title}"`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleCompleteTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.targetTaskTitle) {
    return { success: false, message: "Which task would you like to mark as complete? Please specify the task name." };
  }

  const tasks = await getUserTasks(db, userId);
  const task = tasks.find(t => 
    t.title.toLowerCase().includes(intent.targetTaskTitle!.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `I couldn't find a task named "${intent.targetTaskTitle}". Please check the name and try again.` };
  }

  await toggleTaskStatus(db, task.id, userId);
  const message = `✅ Task completed: "${task.title}"`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleMoveTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.targetTaskTitle) {
    return { success: false, message: "Which task would you like to move? Please specify the task name." };
  }

  if (!intent.destinationFolderName) {
    return { success: false, message: "Which folder would you like to move the task to? Please specify the folder name." };
  }

  const tasks = await getUserTasks(db, userId);
  const task = tasks.find(t => 
    t.title.toLowerCase().includes(intent.targetTaskTitle!.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `I couldn't find a task named "${intent.targetTaskTitle}". Please check the name and try again.` };
  }

  const folders = await getUserFolders(db, userId);
  const folder = folders.find(f => f.name.toLowerCase() === intent.destinationFolderName!.toLowerCase());

  if (!folder) {
    return { success: false, message: `I couldn't find a folder named "${intent.destinationFolderName}". Please check the name and try again.` };
  }

  await updateTask(db, task.id, userId, { folderId: folder.id });
  const message = `✅ Task moved: "${task.title}" → ${folder.name} folder`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleShareTask(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.targetTaskTitle) {
    return { success: false, message: "Which task would you like to share? Please specify the task name." };
  }

  if (!intent.shareWithName && !intent.shareWithEmail) {
    return { success: false, message: "Who would you like to share the task with? Please provide a name or email." };
  }

  const tasks = await getUserTasks(db, userId);
  const task = tasks.find(t => 
    t.title.toLowerCase().includes(intent.targetTaskTitle!.toLowerCase())
  );

  if (!task) {
    return { success: false, message: `I couldn't find a task named "${intent.targetTaskTitle}". Please check the name and try again.` };
  }

  // Search for user to share with
  const searchTerm = intent.shareWithEmail || intent.shareWithName || '';
  const users = await searchUsersForSharing(db, searchTerm, userId);
  const targetUser = users.find(u => 
    u.email?.toLowerCase() === searchTerm.toLowerCase() ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!targetUser) {
    return { success: false, message: `I couldn't find a user matching "${searchTerm}". Please check the name or email and try again.` };
  }

  await createTaskShare(db, {
    ownerId: userId,
    sharedWithUserId: targetUser.id,
    resourceType: 'task',
    resourceId: task.id,
    permission: 'edit',
  });

  const message = `✅ Task shared: "${task.title}" with ${targetUser.firstName || targetUser.email}`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleCreateFolder(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.folderName) {
    return { success: false, message: "What would you like to name the folder?" };
  }

  let parentId: string | undefined;
  if (intent.parentFolderName) {
    const folders = await getUserFolders(db, userId);
    const parent = folders.find(f => f.name.toLowerCase() === intent.parentFolderName!.toLowerCase());
    if (parent) {
      parentId = parent.id;
    }
  }

  const folder = await createFolder(db, {
    userId,
    parentId,
    name: intent.folderName,
    color: '#3B82F6',
    icon: 'folder',
  });

  const message = `✅ Folder created: "${intent.folderName}"${parentId ? ' (subfolder)' : ''}`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleRenameFolder(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.oldFolderName) {
    return { success: false, message: "Which folder would you like to rename? Please specify the current folder name." };
  }

  if (!intent.newFolderName) {
    return { success: false, message: "What would you like to rename the folder to?" };
  }

  const folders = await getUserFolders(db, userId);
  const folder = folders.find(f => f.name.toLowerCase() === intent.oldFolderName!.toLowerCase());

  if (!folder) {
    return { success: false, message: `I couldn't find a folder named "${intent.oldFolderName}". Please check the name and try again.` };
  }

  await updateFolder(db, folder.id, userId, { name: intent.newFolderName });
  const message = `✅ Folder renamed: "${intent.oldFolderName}" → "${intent.newFolderName}"`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleShareFolder(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  if (!intent.folderName) {
    return { success: false, message: "Which folder would you like to share? Please specify the folder name." };
  }

  if (!intent.shareWithName && !intent.shareWithEmail) {
    return { success: false, message: "Who would you like to share the folder with? Please provide a name or email." };
  }

  const folders = await getUserFolders(db, userId);
  const folder = folders.find(f => f.name.toLowerCase() === intent.folderName!.toLowerCase());

  if (!folder) {
    return { success: false, message: `I couldn't find a folder named "${intent.folderName}". Please check the name and try again.` };
  }

  const searchTerm = intent.shareWithEmail || intent.shareWithName || '';
  const users = await searchUsersForSharing(db, searchTerm, userId);
  const targetUser = users.find(u => 
    u.email?.toLowerCase() === searchTerm.toLowerCase() ||
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!targetUser) {
    return { success: false, message: `I couldn't find a user matching "${searchTerm}". Please check the name or email and try again.` };
  }

  await createTaskShare(db, {
    ownerId: userId,
    sharedWithUserId: targetUser.id,
    resourceType: 'task_folder',
    resourceId: folder.id,
    permission: 'edit',
  });

  const message = `✅ Folder shared: "${intent.folderName}" with ${targetUser.firstName || targetUser.email}`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function handleQueryTasks(
  intent: TaskIntent,
  db: Database,
  userId: string,
  whatsappNumberId: string,
  senderPhone: string,
  whatsappService: WhatsAppService
): Promise<{ success: boolean; message?: string }> {
  const tasks = await getUserTasks(db, userId, { status: 'open' });
  
  if (tasks.length === 0) {
    const message = "You don't have any open tasks. Great job! 🎉";
    await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
    return { success: true, message };
  }

  const taskList = tasks.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}${t.folder ? ` (${t.folder.name})` : ''}`).join('\n');
  const message = `📋 Your open tasks:\n\n${taskList}${tasks.length > 10 ? `\n\n...and ${tasks.length - 10} more` : ''}`;
  await sendMessage(whatsappService, senderPhone, message, db, whatsappNumberId, userId);
  return { success: true, message };
}

async function sendMessage(
  whatsappService: WhatsAppService,
  senderPhone: string,
  message: string,
  db: Database,
  whatsappNumberId: string,
  userId: string
): Promise<void> {
  try {
    const response = await whatsappService.sendTextMessage(senderPhone, message);
    const isFreeMessage = await isWithinFreeMessageWindow(db, whatsappNumberId);
    await logOutgoingWhatsAppMessage(db, {
      whatsappNumberId,
      userId,
      messageId: response.messages?.[0]?.id,
      messageType: 'text',
      isFreeMessage,
    });
  } catch (error) {
    logger.error({ error, senderPhone }, 'Failed to send WhatsApp message');
  }
}

