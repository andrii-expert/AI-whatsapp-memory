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
  getUserNotes,
  getRemindersByUserId,
  getPrimaryCalendar,
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
import { CalendarService } from './calendar-service';
import type { CalendarIntent } from '@imaginecalendar/ai-services';

export interface ParsedAction {
  action: string;
  resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event';
  taskName?: string;
  folderName?: string;
  folderRoute?: string;
  targetFolderRoute?: string;
  recipient?: string;
  newName?: string;
  status?: string;
  listFilter?: string; // For list operations: 'all', folder name, status, etc.
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

    // Task operations
    if (trimmed.startsWith('Create a task:')) {
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
      // Match: "Move a task: {task_name} - from folder: {existing_folder_route} - to folder: {target_folder_route}"
      const match = trimmed.match(/^Move a task:\s*(.+?)\s*-\s*from folder:\s*(.+?)\s*-\s*to folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        folderRoute = match[2].trim(); // existing folder route
        targetFolderRoute = match[3].trim();
      } else {
        // Fallback: try without "from folder" for backward compatibility
        const fallbackMatch = trimmed.match(/^Move a task:\s*(.+?)\s*-\s*to folder:\s*(.+)$/i);
        if (fallbackMatch) {
          taskName = fallbackMatch[1].trim();
          targetFolderRoute = fallbackMatch[2].trim();
          // folderRoute will be undefined, and we'll search all folders
        } else {
          missingFields.push('task name, existing folder, or target folder');
        }
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
    } else if (trimmed.startsWith('List tasks:')) {
      action = 'list';
      resourceType = 'task';
      // Match: "List tasks: {folder|all} - status: {open|completed|all}"
      const matchWithStatus = trimmed.match(/^List tasks:\s*(.+?)\s*-\s*status:\s*(.+)$/i);
      if (matchWithStatus) {
        folderRoute = matchWithStatus[1].trim().toLowerCase() === 'all' ? undefined : matchWithStatus[1].trim();
        status = matchWithStatus[2].trim();
      } else {
        // Match: "List tasks: {folder|all}" (no status)
        const matchWithoutStatus = trimmed.match(/^List tasks:\s*(.+)$/i);
        if (matchWithoutStatus) {
          const folderOrAll = matchWithoutStatus[1].trim();
          folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
          status = 'all'; // Default to all statuses
        } else {
          missingFields.push('folder or "all"');
        }
      }
    } else if (trimmed.startsWith('List notes:')) {
      action = 'list';
      resourceType = 'note';
      // Match: "List notes: {folder|all}"
      const match = trimmed.match(/^List notes:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        missingFields.push('folder or "all"');
      }
    } else if (trimmed.startsWith('List reminders:')) {
      action = 'list';
      resourceType = 'reminder';
      // Match: "List reminders: {all|active|paused}"
      const match = trimmed.match(/^List reminders:\s*(.+)$/i);
      if (match) {
        status = match[1].trim();
      } else {
        status = 'all'; // Default to all
      }
    } else if (trimmed.startsWith('List events:')) {
      action = 'list';
      resourceType = 'event';
      // Match: "List events: {timeframe|all} - calendar: {calendar_name}"
      // Use a more flexible regex that handles multi-word timeframes like "this week", "next few days", "rest of the month"
      // First try to match with calendar
      const matchWithCalendar = trimmed.match(/^List events:\s*(.+?)\s*-\s*calendar:\s*(.+)$/i);
      if (matchWithCalendar && matchWithCalendar[1]) {
        listFilter = matchWithCalendar[1].trim();
        // Store calendar name in folderRoute for now (could be enhanced later)
        if (matchWithCalendar[2]) {
          folderRoute = matchWithCalendar[2].trim();
        }
      } else {
        // Match: "List events: {timeframe|all}" - capture everything after "List events:" until end or newline
        // Remove any trailing whitespace or newlines
        const matchWithoutCalendar = trimmed.match(/^List events:\s*(.+?)(?:\s*-\s*calendar:.*)?$/i);
        if (matchWithoutCalendar && matchWithoutCalendar[1]) {
          listFilter = matchWithoutCalendar[1].trim();
        } else {
          // Fallback: extract everything after "List events:"
          const afterPrefix = trimmed.replace(/^List events:\s*/i, '').trim();
          if (afterPrefix) {
            // Remove any trailing "- calendar: ..." part
            listFilter = afterPrefix.split(/\s*-\s*calendar:/i)[0].trim();
          } else {
            listFilter = 'all'; // Default to all
          }
        }
      }
      
      // Clean up listFilter - remove any trailing dashes or calendar references
      if (listFilter) {
        listFilter = listFilter.split(/\s*-\s*calendar:/i)[0].trim();
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
        case 'list':
          if (parsed.resourceType === 'task') {
            return await this.listTasks(parsed);
          } else if (parsed.resourceType === 'note') {
            return await this.listNotes(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.listReminders(parsed);
          } else if (parsed.resourceType === 'event') {
            return await this.listEvents(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to list.",
          };
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

    // If existing folder route is provided, use it to find the task
    let task = null;
    if (parsed.folderRoute) {
      const existingFolderId = await this.resolveFolderRoute(parsed.folderRoute);
      if (!existingFolderId) {
        return {
          success: false,
          message: `I couldn't find the source folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      task = await this.findTaskByName(parsed.taskName, existingFolderId);
      if (!task) {
        return {
          success: false,
          message: `I couldn't find the task "${parsed.taskName}" in the "${parsed.folderRoute}" folder. Please make sure the task exists.`,
        };
      }
    } else {
      // Fallback: search all folders if existing folder route not provided
      const allFolders = await getUserFolders(this.db, this.userId);
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
    }

    // Check if task is already in the target folder
    if (task.folderId === targetFolderId) {
      return {
        success: false,
        message: `The task "${parsed.taskName}" is already in the "${parsed.targetFolderRoute}" folder.`,
      };
    }

    try {
      await updateTask(this.db, task.id, this.userId, {
        folderId: targetFolderId,
      });

      const sourceFolderText = parsed.folderRoute ? ` from "${parsed.folderRoute}"` : '';
      return {
        success: true,
        message: `✅ Task "${parsed.taskName}" has been moved${sourceFolderText} to the "${parsed.targetFolderRoute}" folder.`,
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

  private async listTasks(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folderId = parsed.folderRoute ? await this.resolveFolderRoute(parsed.folderRoute) : undefined;
      
      if (parsed.folderRoute && !folderId) {
        return {
          success: false,
          message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      const statusFilter = parsed.status && parsed.status !== 'all' ? parsed.status as 'open' | 'completed' : undefined;
      const tasks = await getUserTasks(this.db, this.userId, {
        folderId,
        status: statusFilter,
      });

      if (tasks.length === 0) {
        const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
        const statusText = statusFilter ? ` (${statusFilter})` : '';
        return {
          success: true,
          message: `📋 You have no tasks${folderText}${statusText}.`,
        };
      }

      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      const statusText = statusFilter ? ` (${statusFilter})` : '';
      let message = `📋 Your tasks${folderText}${statusText}:\n\n`;
      
      tasks.slice(0, 20).forEach((task, index) => {
        const statusIcon = task.status === 'completed' ? '✅' : '⏳';
        message += `${index + 1}. ${statusIcon} ${task.title}\n`;
      });

      if (tasks.length > 20) {
        message += `\n... and ${tasks.length - 20} more tasks.`;
      }

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, folderRoute: parsed.folderRoute }, 'Failed to list tasks');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your tasks. Please try again.",
      };
    }
  }

  private async listNotes(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folderId = parsed.folderRoute ? await this.resolveFolderRoute(parsed.folderRoute) : undefined;
      
      if (parsed.folderRoute && !folderId) {
        return {
          success: false,
          message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      const notes = await getUserNotes(this.db, this.userId, {
        folderId,
      });

      if (notes.length === 0) {
        const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
        return {
          success: true,
          message: `📝 You have no notes${folderText}.`,
        };
      }

      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      let message = `📝 Your notes${folderText}:\n\n`;
      
      notes.slice(0, 20).forEach((note, index) => {
        const contentPreview = note.content ? (note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content) : '(no content)';
        message += `${index + 1}. ${note.title}\n   ${contentPreview}\n`;
      });

      if (notes.length > 20) {
        message += `\n... and ${notes.length - 20} more notes.`;
      }

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, folderRoute: parsed.folderRoute }, 'Failed to list notes');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your notes. Please try again.",
      };
    }
  }

  private async listReminders(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const reminders = await getRemindersByUserId(this.db, this.userId);

      // Filter by status if specified
      let filteredReminders = reminders;
      if (parsed.status && parsed.status !== 'all') {
        const isActive = parsed.status === 'active';
        filteredReminders = reminders.filter(r => r.active === isActive);
      }

      if (filteredReminders.length === 0) {
        const statusText = parsed.status && parsed.status !== 'all' ? ` (${parsed.status})` : '';
        return {
          success: true,
          message: `🔔 You have no reminders${statusText}.`,
        };
      }

      const statusText = parsed.status && parsed.status !== 'all' ? ` (${parsed.status})` : '';
      let message = `🔔 Your reminders${statusText}:\n\n`;
      
      filteredReminders.slice(0, 20).forEach((reminder, index) => {
        const statusIcon = reminder.active ? '🔔' : '⏸️';
        const scheduleText = reminder.frequency ? ` (${reminder.frequency})` : '';
        message += `${index + 1}. ${statusIcon} ${reminder.title}${scheduleText}\n`;
      });

      if (filteredReminders.length > 20) {
        message += `\n... and ${filteredReminders.length - 20} more reminders.`;
      }

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to list reminders');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your reminders. Please try again.",
      };
    }
  }

  private async listEvents(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      // Check calendar connection first
      const calendarConnection = await getPrimaryCalendar(this.db, this.userId);
      
      if (!calendarConnection) {
        logger.warn({ userId: this.userId }, 'No calendar connection found for list events');
        return {
          success: false,
          message: "I couldn't find a connected calendar. Please connect your calendar in settings first.",
        };
      }
      
      if (!calendarConnection.isActive) {
        logger.warn({ userId: this.userId, calendarId: calendarConnection.id }, 'Calendar connection is inactive');
        return {
          success: false,
          message: "Your calendar connection is inactive. Please reconnect your calendar in settings.",
        };
      }
      
      const timeframe = parsed.listFilter || 'all';
      
      logger.info(
        {
          userId: this.userId,
          originalTimeframe: timeframe,
          listFilter: parsed.listFilter,
          calendarProvider: calendarConnection.provider,
        },
        'Parsing timeframe for event query'
      );
      
      // Map timeframe strings to queryTimeframe values
      let queryTimeframe: 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'all';
      const timeframeLower = timeframe.toLowerCase().trim();
      
      if (timeframeLower === 'today' || timeframeLower.includes("today's")) {
        queryTimeframe = 'today';
      } else if (timeframeLower === 'tomorrow') {
        queryTimeframe = 'tomorrow';
      } else if (
        timeframeLower.includes('week') || 
        timeframeLower === 'this week' ||
        timeframeLower.includes('next few days') ||
        timeframeLower.includes('coming up') ||
        timeframeLower.includes('few days')
      ) {
        queryTimeframe = 'this_week';
      } else if (
        timeframeLower.includes('month') || 
        timeframeLower === 'this month' ||
        timeframeLower.includes('rest of the month') ||
        timeframeLower.includes('rest of month')
      ) {
        queryTimeframe = 'this_month';
      } else {
        queryTimeframe = 'all';
      }
      
      logger.info(
        {
          userId: this.userId,
          originalTimeframe: timeframe,
          mappedTimeframe: queryTimeframe,
        },
        'Timeframe mapped for calendar query'
      );
      
      // Create calendar intent for query
      const intent: CalendarIntent = {
        action: 'QUERY',
        confidence: 0.9,
        queryTimeframe,
      };
      
      // Execute query using CalendarService
      let result;
      try {
        const calendarService = new CalendarService(this.db);
        result = await calendarService.execute(this.userId, intent);
        
        logger.info(
          {
            userId: this.userId,
            success: result.success,
            action: result.action,
            eventCount: result.events?.length || 0,
          },
          'Calendar query executed'
        );
      } catch (calendarError) {
        const errorMessage = calendarError instanceof Error ? calendarError.message : String(calendarError);
        const errorStack = calendarError instanceof Error ? calendarError.stack : undefined;
        
        logger.error(
          {
            error: errorMessage,
            errorStack,
            userId: this.userId,
            queryTimeframe,
            intent: JSON.stringify(intent, null, 2),
          },
          'CalendarService.execute failed'
        );
        
        // Provide more specific error messages based on error type
        if (errorMessage.includes('No calendar connected') || errorMessage.includes('calendar connection')) {
          return {
            success: false,
            message: "I couldn't find a connected calendar. Please connect your calendar in settings first.",
          };
        }
        
        if (errorMessage.includes('authentication') || errorMessage.includes('expired') || errorMessage.includes('token')) {
          return {
            success: false,
            message: "Your calendar authentication has expired. Please reconnect your calendar in settings.",
          };
        }
        
        // Generic error message for other issues
        return {
          success: false,
          message: `I encountered an error retrieving your events: ${errorMessage}. Please try again or reconnect your calendar.`,
        };
      }
      
      if (!result.success) {
        logger.warn(
          {
            userId: this.userId,
            resultMessage: result.message,
            queryTimeframe,
          },
          'Calendar query returned unsuccessful result'
        );
        return {
          success: false,
          message: result.message || "I'm sorry, I couldn't retrieve your events. Please try again.",
        };
      }
      
      // Format response message
      if (result.action === 'QUERY' && result.events) {
        if (result.events.length === 0) {
          const timeframeText = queryTimeframe === 'today' ? 'today' 
            : queryTimeframe === 'tomorrow' ? 'tomorrow'
            : queryTimeframe === 'this_week' ? 'this week'
            : queryTimeframe === 'this_month' ? 'this month'
            : 'upcoming';
          
          return {
            success: true,
            message: `📅 You have no events scheduled ${timeframeText}.`,
          };
        }
        
        let message = `📅 You have ${result.events.length} event${result.events.length !== 1 ? 's' : ''}`;
        const timeframeText = queryTimeframe === 'today' ? 'today' 
          : queryTimeframe === 'tomorrow' ? 'tomorrow'
          : queryTimeframe === 'this_week' ? 'this week'
          : queryTimeframe === 'this_month' ? 'this month'
          : '';
        
        if (timeframeText) {
          message += ` ${timeframeText}`;
        }
        message += ':\n\n';
        
        // Format each event
        result.events.slice(0, 20).forEach((event: { title: string; start: Date; location?: string }, index: number) => {
          const eventTime = event.start.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          });
          const eventDate = event.start.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          
          message += `${index + 1}. ${event.title}\n   📅 ${eventDate} at ${eventTime}`;
          if (event.location) {
            message += `\n   📍 ${event.location}`;
          }
          message += '\n';
        });
        
        if (result.events.length > 20) {
          message += `\n... and ${result.events.length - 20} more event${result.events.length - 20 !== 1 ? 's' : ''}.`;
        }
        
        return {
          success: true,
          message: message.trim(),
        };
      }
      
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your events. Please try again.",
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, timeframe: parsed.listFilter }, 'Failed to list events');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your events. Please try again.",
      };
    }
  }

  /**
   * Resolve folder route (e.g., "Home" or "Work/Clients") to folder ID
   * If only one part is provided, searches all subfolders across all parent folders
   */
  private async resolveFolderRoute(folderRoute: string): Promise<string | null> {
    const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
    const folders = await getUserFolders(this.db, this.userId);
    
    // If only one part is provided, search all subfolders recursively
    if (parts.length === 1) {
      const folderName = parts[0].toLowerCase();
      
      // First check if it's a root folder
      const rootFolder = folders.find(f => f.name.toLowerCase() === folderName);
      if (rootFolder) {
        return rootFolder.id;
      }
      
      // If not found as root folder, search all subfolders recursively
      const foundSubfolder = this.findSubfolderByName(folders, folderName);
      if (foundSubfolder) {
        return foundSubfolder.id;
      }
      
      return null;
    }
    
    // Multiple parts: use the original path-based approach
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
   * Recursively search for a subfolder by name across all folders and subfolders
   */
  private findSubfolderByName(folders: any[], folderName: string): any | null {
    for (const folder of folders) {
      // Check subfolders at this level
      if (folder.subfolders && folder.subfolders.length > 0) {
        const found = folder.subfolders.find(
          (sf: any) => sf.name.toLowerCase() === folderName
        );
        if (found) {
          return found;
        }
        
        // Recursively search deeper subfolders
        for (const subfolder of folder.subfolders) {
          const deeperFound = this.findSubfolderByName([subfolder], folderName);
          if (deeperFound) {
            return deeperFound;
          }
        }
      }
    }
    return null;
  }

  /**
   * Find task by name in a folder
   */
  private async findTaskByName(taskName: string, folderId: string) {
    const tasks = await getUserTasks(this.db, this.userId, { folderId });
    return tasks.find(t => t.title.toLowerCase() === taskName.toLowerCase());
  }

  /**
   * Resolve recipient email or phone number to user ID
   * Returns null if user not found (caller should ask for correct email/phone)
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
    if (!isEmail && !isPhone) {
      const users = await searchUsersForSharing(this.db, this.userId, trimmedRecipient);
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

