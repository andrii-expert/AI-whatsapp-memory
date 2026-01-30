import type { Database } from '@imaginecalendar/database/client';
import {
  createTask,
  createFolder,
  updateTask,
  deleteTask,
  toggleTaskStatus,
  updateFolder,
  deleteFolder,
  getUserFolders,
  getUserTasks,
} from '@imaginecalendar/database/queries';
import {
  createTaskShare,
  searchUsersForSharing,
  getUserById,
  getUserByEmail,
  getUserByPhone,
  normalizePhoneNumber,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';

export interface ParsedAction {
  action: string;
  resourceType: 'task' | 'folder';
  taskName?: string;
  folderName?: string;
  folderRoute?: string;
  targetFolderRoute?: string;
  recipient?: string;
  newName?: string;
  status?: string;
  missingFields: string[];
}

export class ActionExecutor {
  constructor(
    private db: Database,
    private userId: string,
    private whatsappService: WhatsAppService,
    private recipient: string
  ) {}

  /**
   * Parse AI template response into structured action
   */
  parseAction(aiResponse: string): ParsedAction | null {
    const trimmed = aiResponse.trim();
    
    // Check for error/fallback responses
    if (this.isErrorResponse(trimmed)) {
      return null;
    }

    const missingFields: string[] = [];
    let action = '';
    let resourceType: 'task' | 'folder' = 'task';
    let taskName: string | undefined;
    let folderName: string | undefined;
    let folderRoute: string | undefined;
    let targetFolderRoute: string | undefined;
    let recipient: string | undefined;
    let newName: string | undefined;
    let status: string | undefined;

    // Shopping item operations (check before regular task)
    if (trimmed.startsWith('Create a shopping item:')) {
      action = 'create_shopping_item';
      resourceType = 'task';
      // Try full format first: "Create a shopping item: {item} - on folder: Shopping List"
      const fullMatch = trimmed.match(/^Create a shopping item:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (fullMatch) {
        taskName = fullMatch[1].trim();
        folderRoute = fullMatch[2].trim();
      } else {
        // Fallback: just extract the item name after "Create a shopping item:"
        const simpleMatch = trimmed.match(/^Create a shopping item:\s*(.+)$/i);
        if (simpleMatch) {
          taskName = simpleMatch[1].trim();
          folderRoute = 'Shopping List'; // Default to Shopping List
        } else {
          missingFields.push('item name');
        }
      }
    }
    // Task operations
    else if (trimmed.startsWith('Create a task:')) {
      action = 'create';
      resourceType = 'task';
      const match = trimmed.match(/^Create a task:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        folderRoute = match[2].trim();
      } else {
        missingFields.push('task name or folder');
      }
    } else if (trimmed.startsWith('Edit a task:')) {
      action = 'edit';
      resourceType = 'task';
      const match = trimmed.match(/^Edit a task:\s*(.+?)\s*-\s*to:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        newName = match[2].trim();
        folderRoute = match[3].trim();
      } else {
        missingFields.push('task name, new name, or folder');
      }
    } else if (trimmed.startsWith('Delete a task:')) {
      action = 'delete';
      resourceType = 'task';
      const match = trimmed.match(/^Delete a task:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        folderRoute = match[2].trim();
      } else {
        missingFields.push('task name or folder');
      }
    } else if (trimmed.startsWith('Complete a task:')) {
      action = 'complete';
      resourceType = 'task';
      const match = trimmed.match(/^Complete a task:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        folderRoute = match[2].trim();
      } else {
        missingFields.push('task name or folder');
      }
    } else if (trimmed.startsWith('Move a task:')) {
      action = 'move';
      resourceType = 'task';
      const match = trimmed.match(/^Move a task:\s*(.+?)\s*-\s*to folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        targetFolderRoute = match[2].trim();
      } else {
        missingFields.push('task name or target folder');
      }
    } else if (trimmed.startsWith('Share a task:')) {
      action = 'share';
      resourceType = 'task';
      const match = trimmed.match(/^Share a task:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        recipient = match[2].trim();
        folderRoute = match[3].trim();
      } else {
        missingFields.push('task name, recipient, or folder');
      }
    }
    // Folder operations
    else if (trimmed.startsWith('Create a task folder:')) {
      action = 'create';
      resourceType = 'folder';
      const match = trimmed.match(/^Create a task folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Edit a task folder:')) {
      action = 'edit';
      resourceType = 'folder';
      const match = trimmed.match(/^Edit a task folder:\s*(.+?)\s*-\s*to:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
        newName = match[2].trim();
      } else {
        missingFields.push('folder name or new name');
      }
    } else if (trimmed.startsWith('Delete a task folder:')) {
      action = 'delete';
      resourceType = 'folder';
      const match = trimmed.match(/^Delete a task folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Share a task folder:')) {
      action = 'share';
      resourceType = 'folder';
      const match = trimmed.match(/^Share a task folder:\s*(.+?)\s*-\s*with:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
        recipient = match[2].trim();
      } else {
        missingFields.push('folder name or recipient');
      }
    } else if (trimmed.startsWith('Create a task sub-folder:')) {
      action = 'create_subfolder';
      resourceType = 'folder';
      const match = trimmed.match(/^Create a task sub-folder:\s*(.+?)\s*-\s*name:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim(); // parent folder
        newName = match[2].trim(); // subfolder name
      } else {
        missingFields.push('parent folder or subfolder name');
      }
    }

    // Validate required fields
    if (action === 'create' && resourceType === 'task' && !taskName) {
      missingFields.push('task name');
    }
    if (action === 'share' && !recipient) {
      missingFields.push('recipient');
    }
    if (action === 'edit' && !newName) {
      missingFields.push('new name or details');
    }

    return {
      action,
      resourceType,
      taskName,
      folderName,
      folderRoute,
      targetFolderRoute,
      recipient,
      newName,
      status,
      missingFields,
    };
  }

  /**
   * Execute the parsed action
   */
  async executeAction(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      // Check for missing critical fields
      if (parsed.missingFields.length > 0) {
        const clarification = this.buildClarificationMessage(parsed);
        await this.whatsappService.sendTextMessage(this.recipient, clarification);
        return { success: false, message: clarification };
      }

      switch (parsed.action) {
        case 'create_shopping_item':
          return await this.createShoppingItem(parsed);
        case 'create':
          if (parsed.resourceType === 'task') {
            return await this.createTask(parsed);
          } else {
            return await this.createFolder(parsed);
          }
        case 'edit':
          if (parsed.resourceType === 'task') {
            return await this.editTask(parsed);
          } else {
            return await this.editFolder(parsed);
          }
        case 'delete':
          if (parsed.resourceType === 'task') {
            return await this.deleteTask(parsed);
          } else {
            return await this.deleteFolder(parsed);
          }
        case 'complete':
          return await this.completeTask(parsed);
        case 'move':
          return await this.moveTask(parsed);
        case 'share':
          if (parsed.resourceType === 'task') {
            return await this.shareTask(parsed);
          } else {
            return await this.shareFolder(parsed);
          }
        case 'create_subfolder':
          return await this.createSubfolder(parsed);
        default:
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what action you want me to perform.",
          };
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          action: parsed.action,
          resourceType: parsed.resourceType,
          userId: this.userId,
        },
        'Failed to execute action'
      );
      return {
        success: false,
        message: "I'm sorry, I encountered an error while processing your request. Please try again.",
      };
    }
  }

  private async createTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know what task you'd like to create. Please specify the task name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute || 'General');
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
      };
    }

    try {
      const task = await createTask(this.db, {
        userId: this.userId,
        folderId,
        title: parsed.taskName,
        status: 'open',
      });

      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been created successfully in the "${parsed.folderRoute || 'General'}" folder.`,
      };
    } catch (error) {
      logger.error({ error, taskName: parsed.taskName, userId: this.userId }, 'Failed to create task');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the task "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async createShoppingItem(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know what item you'd like to add to your shopping list. Please specify the item.",
      };
    }

    // Always use "Shopping List" folder for shopping items
    const shoppingFolderName = 'Shopping List';
    let folderId = await this.resolveFolderRoute(shoppingFolderName);
    
    // Auto-create Shopping List folder if it doesn't exist
    if (!folderId) {
      try {
        const folder = await createFolder(this.db, {
          userId: this.userId,
          name: shoppingFolderName,
          color: '#10B981', // Green color
          icon: 'shopping-cart',
        });
        folderId = folder.id;
        logger.info({ userId: this.userId, folderId }, 'Auto-created Shopping List folder');
      } catch (error) {
        logger.error({ error, userId: this.userId }, 'Failed to auto-create Shopping List folder');
        return {
          success: false,
          message: "I couldn't create the Shopping List folder. Please try again.",
        };
      }
    }

    try {
      await createTask(this.db, {
        userId: this.userId,
        folderId,
        title: parsed.taskName,
        status: 'open',
      });

      return {
        success: true,
        message: `✓ Added "${parsed.taskName}" to Shopping List`,
      };
    } catch (error) {
      logger.error({ error, itemName: parsed.taskName, userId: this.userId }, 'Failed to add shopping item');
      return {
        success: false,
        message: `I'm sorry, I couldn't add "${parsed.taskName}" to your shopping list. Please try again.`,
      };
    }
  }

  private async createFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know what folder you'd like to create. Please specify the folder name.",
      };
    }

    try {
      const folder = await createFolder(this.db, {
        userId: this.userId,
        name: parsed.folderRoute,
      });

      return {
        success: true,
        message: `✅ Folder "${parsed.folderRoute}" has been created successfully.`,
      };
    } catch (error) {
      logger.error({ error, folderName: parsed.folderRoute, userId: this.userId }, 'Failed to create folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async shareFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which folder you'd like to share. Please specify the folder name.",
      };
    }

    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to share with. Please specify the recipient name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute);
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
      };
    }

    const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
    if (!sharedWithUserId) {
      // Check if recipient looks like email or phone
      const isEmail = parsed.recipient.includes('@') && parsed.recipient.includes('.');
      const hasDigits = /\d/.test(parsed.recipient);
      const isPhone = hasDigits && (parsed.recipient.startsWith('+') || /^[\d\s\-\(\)]+$/.test(parsed.recipient.replace(/\+/g, '')));
      
      if (isEmail) {
        return {
          success: false,
          message: `I couldn't find a user with the email address "${parsed.recipient}". Please check the email address and make sure the person has a CrackOn account.`,
        };
      } else if (isPhone) {
        return {
          success: false,
          message: `I couldn't find a user with the phone number "${parsed.recipient}". Please check the phone number and make sure the person has a CrackOn account.`,
        };
      } else {
        return {
          success: false,
          message: `I couldn't find a user with "${parsed.recipient}". Please provide the recipient's email address or phone number (e.g., "john@example.com" or "+27123456789").`,
        };
      }
    }

    try {
      await createTaskShare(this.db, {
        resourceType: 'task_folder',
        resourceId: folderId,
        ownerId: this.userId,
        sharedWithUserId,
        permission: 'view', // Default to view, can be enhanced later
      });

      return {
        success: true,
        message: `✅ Folder "${parsed.folderRoute}" has been shared successfully with ${parsed.recipient}.`,
      };
    } catch (error) {
      logger.error(
        { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
        'Failed to share folder'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't share the folder "${parsed.folderRoute}" with ${parsed.recipient}. Please try again.`,
      };
    }
  }

  private async shareTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to share. Please specify the task name.",
      };
    }

    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to share with. Please specify the recipient name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute || 'General');
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute || 'General'}". Please make sure the folder exists.`,
      };
    }

    const task = await this.findTaskByName(parsed.taskName, folderId);
    if (!task) {
      return {
        success: false,
        message: `I couldn't find the task "${parsed.taskName}" in the "${parsed.folderRoute || 'General'}" folder. Please make sure the task exists.`,
      };
    }

    const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
    if (!sharedWithUserId) {
      // Check if recipient looks like email or phone
      const isEmail = parsed.recipient.includes('@') && parsed.recipient.includes('.');
      const hasDigits = /\d/.test(parsed.recipient);
      const isPhone = hasDigits && (parsed.recipient.startsWith('+') || /^[\d\s\-\(\)]+$/.test(parsed.recipient.replace(/\+/g, '')));
      
      if (isEmail) {
        return {
          success: false,
          message: `I couldn't find a user with the email address "${parsed.recipient}". Please check the email address and make sure the person has a CrackOn account.`,
        };
      } else if (isPhone) {
        return {
          success: false,
          message: `I couldn't find a user with the phone number "${parsed.recipient}". Please check the phone number and make sure the person has a CrackOn account.`,
        };
      } else {
        return {
          success: false,
          message: `I couldn't find a user with "${parsed.recipient}". Please provide the recipient's email address or phone number (e.g., "john@example.com" or "+27123456789").`,
        };
      }
    }

    try {
      await createTaskShare(this.db, {
        resourceType: 'task',
        resourceId: task.id,
        ownerId: this.userId,
        sharedWithUserId,
        permission: 'view',
      });

      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been shared successfully with ${parsed.recipient}.`,
      };
    } catch (error) {
      logger.error(
        { error, taskName: parsed.taskName, recipient: parsed.recipient, userId: this.userId },
        'Failed to share task'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't share the task "${parsed.taskName}" with ${parsed.recipient}. Please try again.`,
      };
    }
  }

  private async editTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName || !parsed.newName) {
      return {
        success: false,
        message: "I need to know which task to edit and what the new name should be. Please specify both.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute || 'General');
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute || 'General'}". Please make sure the folder exists.`,
      };
    }

    const task = await this.findTaskByName(parsed.taskName, folderId);
    if (!task) {
      return {
        success: false,
        message: `I couldn't find the task "${parsed.taskName}" in the "${parsed.folderRoute || 'General'}" folder. Please make sure the task exists.`,
      };
    }

    try {
      await updateTask(this.db, task.id, this.userId, {
        title: parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName,
      });

      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been updated successfully.`,
      };
    } catch (error) {
      logger.error({ error, taskId: task.id, userId: this.userId }, 'Failed to update task');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the task "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async deleteTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to delete. Please specify the task name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute || 'General');
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute || 'General'}". Please make sure the folder exists.`,
      };
    }

    const task = await this.findTaskByName(parsed.taskName, folderId);
    if (!task) {
      return {
        success: false,
        message: `I couldn't find the task "${parsed.taskName}" in the "${parsed.folderRoute || 'General'}" folder. Please make sure the task exists.`,
      };
    }

    try {
      await deleteTask(this.db, task.id, this.userId);
      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been deleted successfully.`,
      };
    } catch (error) {
      logger.error({ error, taskId: task.id, userId: this.userId }, 'Failed to delete task');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the task "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async completeTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to complete. Please specify the task name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute || 'General');
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute || 'General'}". Please make sure the folder exists.`,
      };
    }

    const task = await this.findTaskByName(parsed.taskName, folderId);
    if (!task) {
      return {
        success: false,
        message: `I couldn't find the task "${parsed.taskName}" in the "${parsed.folderRoute || 'General'}" folder. Please make sure the task exists.`,
      };
    }

    try {
      await toggleTaskStatus(this.db, task.id, this.userId);
      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been marked as completed.`,
      };
    } catch (error) {
      logger.error({ error, taskId: task.id, userId: this.userId }, 'Failed to complete task');
      return {
        success: false,
        message: `I'm sorry, I couldn't complete the task "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async moveTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName || !parsed.targetFolderRoute) {
      return {
        success: false,
        message: "I need to know which task to move and which folder to move it to. Please specify both.",
      };
    }

    const targetFolderId = await this.resolveFolderRoute(parsed.targetFolderRoute);
    if (!targetFolderId) {
      return {
        success: false,
        message: `I couldn't find the target folder "${parsed.targetFolderRoute}". Please make sure the folder exists.`,
      };
    }

    // Find task in any folder (we'll search all folders)
    const allFolders = await getUserFolders(this.db, this.userId);
    let task = null;
    for (const folder of allFolders) {
      const found = await this.findTaskByName(parsed.taskName, folder.id);
      if (found) {
        task = found;
        break;
      }
    }

    if (!task) {
      return {
        success: false,
        message: `I couldn't find the task "${parsed.taskName}". Please make sure the task exists.`,
      };
    }

    try {
      await updateTask(this.db, task.id, this.userId, {
        folderId: targetFolderId,
      });

      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been moved to the "${parsed.targetFolderRoute}" folder.`,
      };
    } catch (error) {
      logger.error({ error, taskId: task.id, userId: this.userId }, 'Failed to move task');
      return {
        success: false,
        message: `I'm sorry, I couldn't move the task "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async editFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute || !parsed.newName) {
      return {
        success: false,
        message: "I need to know which folder to edit and what the new name should be. Please specify both.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute);
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
      };
    }

    try {
      await updateFolder(this.db, folderId, this.userId, {
        name: parsed.newName,
      });

      return {
        success: true,
        message: `✅ Folder "${parsed.folderRoute}" has been renamed to "${parsed.newName}".`,
      };
    } catch (error) {
      logger.error({ error, folderId, userId: this.userId }, 'Failed to update folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async deleteFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which folder you'd like to delete. Please specify the folder name.",
      };
    }

    const folderId = await this.resolveFolderRoute(parsed.folderRoute);
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
      };
    }

    try {
      await deleteFolder(this.db, folderId, this.userId);
      return {
        success: true,
        message: `✅ Folder "${parsed.folderRoute}" has been deleted successfully.`,
      };
    } catch (error) {
      logger.error({ error, folderId, userId: this.userId }, 'Failed to delete folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async createSubfolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute || !parsed.newName) {
      return {
        success: false,
        message: "I need to know which parent folder to use and what the subfolder name should be. Please specify both.",
      };
    }

    const parentFolderId = await this.resolveFolderRoute(parsed.folderRoute);
    if (!parentFolderId) {
      return {
        success: false,
        message: `I couldn't find the parent folder "${parsed.folderRoute}". Please make sure the folder exists.`,
      };
    }

    try {
      await createFolder(this.db, {
        userId: this.userId,
        name: parsed.newName,
        parentId: parentFolderId,
      });

      return {
        success: true,
        message: `✅ Subfolder "${parsed.newName}" has been created successfully in the "${parsed.folderRoute}" folder.`,
      };
    } catch (error) {
      logger.error({ error, parentFolderId, subfolderName: parsed.newName, userId: this.userId }, 'Failed to create subfolder');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the subfolder "${parsed.newName}". Please try again.`,
      };
    }
  }

  /**
   * Resolve folder route (e.g., "All Lists" or "Work/Clients") to folder ID
   */
  private async resolveFolderRoute(folderRoute: string): Promise<string | null> {
    const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
    const folders = await getUserFolders(this.db, this.userId);
    
    // Find root folder
    let currentFolder = folders.find(f => f.name.toLowerCase() === parts[0].toLowerCase());
    if (!currentFolder) {
      return null;
    }

    // Navigate through subfolders
    for (let i = 1; i < parts.length; i++) {
      const subfolder = currentFolder.subfolders?.find(
        sf => sf.name.toLowerCase() === parts[i].toLowerCase()
      );
      if (!subfolder) {
        return null;
      }
      currentFolder = subfolder;
    }

    return currentFolder.id;
  }

  /**
   * Find task by name in a folder
   */
  private async findTaskByName(taskName: string, folderId: string) {
    const tasks = await getUserTasks(this.db, this.userId, { folderId });
    return tasks.find(t => t.title.toLowerCase() === taskName.toLowerCase());
  }

  /**
   * Resolve recipient email, phone number, or friend name to user ID
   * Returns null if user not found (caller should ask for correct email/phone/name)
   */
  private async resolveRecipient(recipient: string): Promise<string | null> {
    const trimmedRecipient = recipient.trim();
    
    // Check if recipient looks like an email address
    const isEmail = trimmedRecipient.includes('@') && trimmedRecipient.includes('.');
    
    // Check if recipient looks like a phone number (contains digits)
    const hasDigits = /\d/.test(trimmedRecipient);
    const isPhone = hasDigits && (trimmedRecipient.startsWith('+') || /^[\d\s\-\(\)]+$/.test(trimmedRecipient.replace(/\+/g, '')));
    
    // Try to find user by email
    if (isEmail) {
      try {
        const user = await getUserByEmail(this.db, trimmedRecipient.toLowerCase());
        if (user && user.id !== this.userId) {
          return user.id;
        }
      } catch (error) {
        logger.error(
          { error, recipient: trimmedRecipient, userId: this.userId },
          'Error looking up user by email'
        );
      }
    }
    
    // Try to find user by phone number
    if (isPhone) {
      try {
        // Normalize phone number
        const normalizedPhone = normalizePhoneNumber(trimmedRecipient);
        const user = await getUserByPhone(this.db, normalizedPhone, this.userId);
        if (user) {
          return user.id;
        }
      } catch (error) {
        logger.error(
          { error, recipient: trimmedRecipient, userId: this.userId },
          'Error looking up user by phone'
        );
      }
    }
    
    // If recipient doesn't look like email or phone, try searching by name/partial match
    // This handles cases where user provided a name instead of email/phone
    // This now includes searching by friend name
    if (!isEmail && !isPhone) {
      const users = await searchUsersForSharing(this.db, trimmedRecipient, this.userId);
      if (users.length > 0) {
        return users[0].id;
      }
    }
    
    // User not found
    return null;
  }

  /**
   * Build clarification message for missing fields
   */
  private buildClarificationMessage(parsed: ParsedAction): string {
    const missing = parsed.missingFields.join(', ');
    return `I understand you want to ${parsed.action} a ${parsed.resourceType}, but I need more information: ${missing}. Please provide the missing details.`;
  }

  /**
   * Check if response is an error/fallback
   */
  private isErrorResponse(text: string): boolean {
    const normalized = text.toLowerCase().trim();
    return (
      normalized.includes("i'm sorry") ||
      normalized.includes("i didn't understand") ||
      normalized.includes("couldn't interpret") ||
      normalized.includes("could you rephrase") ||
      normalized.includes("please rephrase") ||
      normalized.length === 0
    );
  }
}

