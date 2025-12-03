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
  createReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
  getReminderById,
  type CreateReminderInput,
  type UpdateReminderInput,
  type ReminderFrequency,
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
    let listFilter: string | undefined;

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
      
      // Extract everything after "List events:"
      const afterPrefix = trimmed.replace(/^List events:\s*/i, '').trim();
      
      if (afterPrefix) {
        // Remove any trailing "- calendar: ..." part first
        listFilter = afterPrefix.split(/\s*-\s*calendar:/i)[0].trim();
        
        // Remove common prefixes like "for", "on", "in", "all" that might appear before timeframes
        // Examples: "for today" -> "today", "on tomorrow" -> "tomorrow", "in this week" -> "this week", "all events" -> "all"
        listFilter = listFilter.replace(/^(for|on|in|during|all\s+events?|show\s+me\s+all\s+events?\s+for)\s+/i, '').trim();
        
        // If listFilter is empty after cleaning, default to 'all'
        if (!listFilter || listFilter.length === 0) {
          listFilter = 'all';
        }
      } else {
        // If nothing after "List events:", default to 'all'
        listFilter = 'all';
      }
      
      // Also check for calendar specification (if present)
      const calendarMatch = trimmed.match(/\s*-\s*calendar:\s*(.+)$/i);
      if (calendarMatch && calendarMatch[1]) {
        folderRoute = calendarMatch[1].trim();
      }
      
      logger.debug(
        {
          originalText: trimmed,
          extractedListFilter: listFilter,
          afterPrefix,
        },
        'Parsed List events action'
      );
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
      listFilter,
      missingFields,
    };
  }

  /**
   * Execute the parsed action
   */
  async executeAction(parsed: ParsedAction, timezone?: string): Promise<{ success: boolean; message: string }> {
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
          } else if (parsed.resourceType === 'reminder') {
            return await this.createReminder(parsed, timezone);
          } else {
            return await this.createFolder(parsed);
          }
        case 'edit':
          if (parsed.resourceType === 'task') {
            return await this.editTask(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.updateReminder(parsed, timezone);
          } else {
            return await this.editFolder(parsed);
          }
        case 'delete':
          if (parsed.resourceType === 'task') {
            return await this.deleteTask(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.deleteReminder(parsed);
          } else {
            return await this.deleteFolder(parsed);
          }
        case 'pause':
          if (parsed.resourceType === 'reminder') {
            return await this.pauseReminder(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to pause.",
          };
        case 'resume':
          if (parsed.resourceType === 'reminder') {
            return await this.resumeReminder(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to resume.",
          };
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

  /**
   * Parse schedule string to reminder input format
   * Examples:
   * - "at 5pm" → once, time: "17:00"
   * - "tomorrow morning" → once, daysFromNow: 1, time: "09:00"
   * - "every day at 9am" → daily, time: "09:00"
   * - "weekly on Monday at 8am" → weekly, daysOfWeek: [1], time: "08:00"
   * - "monthly on the 1st" → monthly, dayOfMonth: 1
   * - "later" → once (no specific time)
   * - "on the 1st" → once, dayOfMonth: 1
   */
  private parseReminderSchedule(schedule: string, timezone?: string): Partial<CreateReminderInput> {
    const scheduleLower = schedule.toLowerCase().trim();
    const result: Partial<CreateReminderInput> = {};

    // Check for recurring patterns first
    if (scheduleLower.includes('every day') || scheduleLower.includes('daily')) {
      result.frequency = 'daily';
      // Extract time if present
      const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (timeMatch && timeMatch[1]) {
        result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
      } else {
        // Default to 9am if no time specified
        result.time = '09:00';
      }
    } else if (scheduleLower.includes('every week') || scheduleLower.includes('weekly')) {
      result.frequency = 'weekly';
      // Extract day of week
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayMatch = scheduleLower.match(/(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
      if (dayMatch && dayMatch[1]) {
        const dayIndex = dayNames.indexOf(dayMatch[1].toLowerCase());
        if (dayIndex !== -1) {
          result.daysOfWeek = [dayIndex];
        }
      } else {
        // Default to Monday if no day specified
        result.daysOfWeek = [1];
      }
      // Extract time if present
      const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (timeMatch && timeMatch[1]) {
        result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
      } else {
        // Default to 8am if no time specified
        result.time = '08:00';
      }
    } else if (scheduleLower.includes('every month') || scheduleLower.includes('monthly')) {
      result.frequency = 'monthly';
      // Extract day of month
      const dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
      if (dayMatch && dayMatch[1]) {
        result.dayOfMonth = parseInt(dayMatch[1], 10);
      } else {
        // Default to 1st if no day specified
        result.dayOfMonth = 1;
      }
      // Extract time if present
      const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (timeMatch && timeMatch[1]) {
        result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
      } else {
        // Default to 9am if no time specified
        result.time = '09:00';
      }
    } else if (scheduleLower.includes('every hour') || scheduleLower.includes('hourly')) {
      result.frequency = 'hourly';
    } else if (scheduleLower.includes('every minute') || scheduleLower.includes('minutely')) {
      result.frequency = 'minutely';
    } else {
      // Default to once
      result.frequency = 'once';
      
      // Check for relative dates
      if (scheduleLower.includes('tomorrow')) {
        result.daysFromNow = 1;
        // Extract time based on time of day or explicit time
        if (scheduleLower.includes('morning')) {
          result.time = '09:00';
        } else if (scheduleLower.includes('afternoon')) {
          result.time = '14:00';
        } else if (scheduleLower.includes('evening') || scheduleLower.includes('night')) {
          result.time = '18:00';
        } else {
          const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
          if (timeMatch && timeMatch[1]) {
            result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
          } else {
            // Default to 9am for tomorrow if no time specified
            result.time = '09:00';
          }
        }
      } else if (scheduleLower.includes('today') || scheduleLower.includes('tonight')) {
        result.daysFromNow = 0;
        if (scheduleLower.includes('tonight') || scheduleLower.includes('night')) {
          result.time = '18:00';
        } else {
          const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
          if (timeMatch && timeMatch[1]) {
            result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
          }
        }
      } else if (scheduleLower.includes('later')) {
        // "later" means once, no specific time/date
        result.frequency = 'once';
      } else {
        // Extract time
        const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch && timeMatch[1]) {
          result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
        }
        
        // Check for specific date (e.g., "on the 1st")
        const dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
        if (dayMatch && dayMatch[1]) {
          const dayNum = parseInt(dayMatch[1], 10);
          const now = new Date();
          const currentDay = now.getDate();
          if (dayNum >= 1 && dayNum <= 31) {
            // If day is in the past this month, schedule for next month
            if (dayNum < currentDay) {
              result.dayOfMonth = dayNum;
              result.month = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
            } else {
              result.dayOfMonth = dayNum;
              result.month = now.getMonth() + 1;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Parse time string to 24-hour format (HH:MM)
   */
  private parseTimeTo24Hour(timeStr: string): string {
    const trimmed = timeStr.trim().toLowerCase();
    
    // Already in HH:MM format
    if (/^\d{2}:\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Parse 12-hour format
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (match) {
      let hours = parseInt(match[1] || '0', 10);
      const minutes = parseInt(match[2] || '0', 10);
      const period = match[3]?.toLowerCase();
      
      if (period === 'pm' && hours !== 12) {
        hours += 12;
      } else if (period === 'am' && hours === 12) {
        hours = 0;
      }
      
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    
    // Default to current time or 09:00
    return '09:00';
  }

  private async createReminder(parsed: ParsedAction, timezone?: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know what you want to be reminded about. Please provide a reminder title.",
        };
      }

      const scheduleStr = parsed.listFilter || 'once';
      const scheduleData = this.parseReminderSchedule(scheduleStr, timezone);
      
      const reminderInput: CreateReminderInput = {
        userId: this.userId,
        title: parsed.taskName,
        frequency: scheduleData.frequency || 'once',
        time: scheduleData.time,
        minuteOfHour: scheduleData.minuteOfHour,
        intervalMinutes: scheduleData.intervalMinutes,
        daysFromNow: scheduleData.daysFromNow,
        targetDate: scheduleData.targetDate,
        dayOfMonth: scheduleData.dayOfMonth,
        month: scheduleData.month,
        daysOfWeek: scheduleData.daysOfWeek,
        active: parsed.status === 'paused' ? false : true,
      };

      const reminder = await createReminder(this.db, reminderInput);

      logger.info({ userId: this.userId, reminderId: reminder.id, timezone }, 'Reminder created');

      // Format response message with timezone-aware time display
      let responseMessage = `🔔 Reminder "${reminder.title}" created successfully!`;
      
      if (reminder.time) {
        // Format time in user's timezone
        // Create a date representing today in UTC, then format it in the user's timezone
        const timeParts = reminder.time.split(':');
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        
        // Create a date for today, then format the time portion in the user's timezone
        // We'll use Intl.DateTimeFormat to format just the time
        const tz = timezone || 'Africa/Johannesburg';
        const formatter = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz,
        });
        
        // Create a date object for today at the specified time in UTC
        // Then adjust it so when displayed in the user's timezone, it shows the correct time
        const now = new Date();
        const utcDate = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          hours,
          minutes,
          0
        ));
        
        // Get what this UTC time would be in the user's timezone
        const localTimeStr = utcDate.toLocaleString('en-US', { timeZone: tz, hour12: false });
        const localTimeParts = localTimeStr.split(', ')[1]?.split(':') || [];
        const localHours = parseInt(localTimeParts[0] || '0', 10);
        const localMinutes = parseInt(localTimeParts[1] || '0', 10);
        
        // Calculate the offset
        const offsetHours = hours - localHours;
        const offsetMinutes = minutes - localMinutes;
        
        // Create a date that, when formatted in the user's timezone, shows the desired time
        const adjustedDate = new Date();
        adjustedDate.setUTCHours(hours - offsetHours, minutes - offsetMinutes, 0, 0);
        
        // Actually, simpler approach: just format the time string directly
        // Since reminder.time is stored as "HH:MM" in the user's intended local time,
        // we can create a date for today and set it to that time, then format
        const timeDate = new Date();
        // Parse the time as if it's in the user's timezone
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        // Use a simpler approach: format the time directly
        const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const period = hours >= 12 ? 'PM' : 'AM';
        const formattedTime = `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
        
        if (reminder.frequency === 'once') {
          if (reminder.daysFromNow !== undefined) {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
            const dateStr = targetDate.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              timeZone: tz,
            });
            responseMessage += `\n📅 ${dateStr} at ${formattedTime}`;
          } else if (reminder.dayOfMonth) {
            responseMessage += `\n📅 On the ${reminder.dayOfMonth}${this.getOrdinalSuffix(reminder.dayOfMonth)} at ${formattedTime}`;
          } else {
            responseMessage += `\n⏰ ${formattedTime}`;
          }
        } else if (reminder.frequency === 'daily') {
          responseMessage += `\n⏰ Daily at ${formattedTime}`;
        } else if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const dayName = dayNames[reminder.daysOfWeek[0]];
          responseMessage += `\n⏰ Weekly on ${dayName} at ${formattedTime}`;
        } else if (reminder.frequency === 'monthly' && reminder.dayOfMonth) {
          responseMessage += `\n⏰ Monthly on the ${reminder.dayOfMonth}${this.getOrdinalSuffix(reminder.dayOfMonth)} at ${formattedTime}`;
        } else {
          responseMessage += `\n⏰ ${formattedTime}`;
        }
      }

      return {
        success: true,
        message: responseMessage,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to create reminder');
      return {
        success: false,
        message: "I'm sorry, I couldn't create your reminder. Please try again.",
      };
    }
  }

  private getOrdinalSuffix(day: number): string {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  private async updateReminder(parsed: ParsedAction, timezone?: string): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which reminder you want to update. Please provide the reminder title.",
        };
      }

      // Find reminder by title
      const reminders = await getRemindersByUserId(this.db, this.userId);
      const reminder = reminders.find(r => 
        r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
      );

      if (!reminder) {
        return {
          success: false,
          message: `I couldn't find a reminder matching "${parsed.taskName}". Please check the reminder title and try again.`,
        };
      }

      const updateInput: UpdateReminderInput = {};

      if (parsed.newName) {
        // Parse changes
        const changes = parsed.newName.toLowerCase();
        
        // Check for time changes
        if (changes.includes('time') || changes.includes('at')) {
          const timeMatch = parsed.newName.match(/(?:to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
          if (timeMatch && timeMatch[1]) {
            updateInput.time = this.parseTimeTo24Hour(timeMatch[1].trim());
          }
        }
        
        // Check for date changes
        if (changes.includes('date') || changes.includes('tomorrow') || changes.includes('monday') || changes.includes('tuesday') || changes.includes('wednesday') || changes.includes('thursday') || changes.includes('friday') || changes.includes('saturday') || changes.includes('sunday')) {
          const scheduleData = this.parseReminderSchedule(parsed.newName, timezone);
          if (scheduleData.daysFromNow !== undefined) {
            updateInput.daysFromNow = scheduleData.daysFromNow;
          }
          if (scheduleData.targetDate) {
            updateInput.targetDate = scheduleData.targetDate;
          }
        }
        
        // Check for title changes
        if (changes.includes('title') || changes.includes('rename')) {
          const titleMatch = parsed.newName.match(/(?:to|rename)\s+(.+?)(?:\s|$)/i);
          if (titleMatch && titleMatch[1]) {
            updateInput.title = titleMatch[1].trim();
          }
        }
      }

      const updated = await updateReminder(this.db, reminder.id, this.userId, updateInput);

      logger.info({ userId: this.userId, reminderId: updated.id, timezone }, 'Reminder updated');

      // Format response message with timezone-aware time display
      let responseMessage = `🔔 Reminder "${updated.title || reminder.title}" updated successfully!`;
      
      if (updated.time || reminder.time) {
        const timeToDisplay = updated.time || reminder.time;
        if (timeToDisplay) {
          const timeParts = timeToDisplay.split(':');
          const hours = parseInt(timeParts[0] || '0', 10);
          const minutes = parseInt(timeParts[1] || '0', 10);
          
          // Format time directly (since it's stored as local time)
          const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
          const period = hours >= 12 ? 'PM' : 'AM';
          const formattedTime = `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
          
          responseMessage += `\n⏰ ${formattedTime}`;
        }
      }

      return {
        success: true,
        message: responseMessage,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to update reminder');
      return {
        success: false,
        message: "I'm sorry, I couldn't update your reminder. Please try again.",
      };
    }
  }

  private async deleteReminder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which reminder you want to delete. Please provide the reminder title.",
        };
      }

      // Find reminder by title
      const reminders = await getRemindersByUserId(this.db, this.userId);
      const reminder = reminders.find(r => 
        r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
      );

      if (!reminder) {
        return {
          success: false,
          message: `I couldn't find a reminder matching "${parsed.taskName}". Please check the reminder title and try again.`,
        };
      }

      await deleteReminder(this.db, reminder.id, this.userId);

      logger.info({ userId: this.userId, reminderId: reminder.id }, 'Reminder deleted');

      return {
        success: true,
        message: `🔔 Reminder "${reminder.title}" deleted successfully!`,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to delete reminder');
      return {
        success: false,
        message: "I'm sorry, I couldn't delete your reminder. Please try again.",
      };
    }
  }

  private async pauseReminder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which reminder you want to pause. Please provide the reminder title.",
        };
      }

      // Find reminder by title
      const reminders = await getRemindersByUserId(this.db, this.userId);
      const reminder = reminders.find(r => 
        r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
      );

      if (!reminder) {
        return {
          success: false,
          message: `I couldn't find a reminder matching "${parsed.taskName}". Please check the reminder title and try again.`,
        };
      }

      await toggleReminderActive(this.db, reminder.id, this.userId, false);

      logger.info({ userId: this.userId, reminderId: reminder.id }, 'Reminder paused');

      return {
        success: true,
        message: `🔔 Reminder "${reminder.title}" paused successfully!`,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to pause reminder');
      return {
        success: false,
        message: "I'm sorry, I couldn't pause your reminder. Please try again.",
      };
    }
  }

  private async resumeReminder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which reminder you want to resume. Please provide the reminder title.",
        };
      }

      // Find reminder by title
      const reminders = await getRemindersByUserId(this.db, this.userId);
      const reminder = reminders.find(r => 
        r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
      );

      if (!reminder) {
        return {
          success: false,
          message: `I couldn't find a reminder matching "${parsed.taskName}". Please check the reminder title and try again.`,
        };
      }

      await toggleReminderActive(this.db, reminder.id, this.userId, true);

      logger.info({ userId: this.userId, reminderId: reminder.id }, 'Reminder resumed');

      return {
        success: true,
        message: `🔔 Reminder "${reminder.title}" resumed successfully!`,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to resume reminder');
      return {
        success: false,
        message: "I'm sorry, I couldn't resume your reminder. Please try again.",
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
      
      // Ensure listFilter is set, default to 'all' if not provided
      const timeframe = parsed.listFilter || 'all';
      
      logger.info(
        {
          userId: this.userId,
          listFilter: parsed.listFilter,
          timeframe,
          parsedAction: JSON.stringify(parsed, null, 2),
        },
        'List events - timeframe extracted'
      );
      
      logger.info(
        {
          userId: this.userId,
          originalTimeframe: timeframe,
          listFilter: parsed.listFilter,
          calendarProvider: calendarConnection.provider,
        },
        'Parsing timeframe for event query'
      );
      
      // First, try to parse as a specific date
      let parsedDate: string | undefined;
      const timeframeLower = timeframe.toLowerCase().trim();
      
      // Try to parse specific dates like "4th december", "december 4", "4 december", etc.
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
      const monthAbbr = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 
                         'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      // Pattern: "4th december", "4 december", "december 4", "december 4th", "4th dec", "dec 4", etc.
      for (let i = 0; i < monthNames.length; i++) {
        const monthName = monthNames[i];
        const monthAb = monthAbbr[i];
        
        // Pattern: "[day] [Month]" or "[Month] [day]" with optional "th", "st", "nd", "rd"
        // Examples: "4th december", "4 december", "december 4", "december 4th", "dec 1", "1 dec", "on 4th december", "on the 4th december"
        // Note: Using word boundaries and more flexible spacing
        const pattern1 = new RegExp(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}(?:\\s+\\d{4})?\\b|\\b${monthName}\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+\\d{4})?`, 'i');
        const pattern2 = new RegExp(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthAb}\\b(?:\\s+\\d{4})?|\\b${monthAb}\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+\\d{4})?`, 'i');
        
        const match1 = timeframeLower.match(pattern1);
        const match2 = timeframeLower.match(pattern2);
        const match = match1 || match2;
        
        if (match) {
          const dayNum = parseInt(match[1] || match[2] || '0', 10);
          if (dayNum >= 1 && dayNum <= 31) {
            const now = new Date();
            const currentYear = now.getFullYear();
            
            // Try current year first
            let targetDate = new Date(currentYear, i, dayNum);
            
            // Check if the date is valid (handles cases like Feb 30)
            if (targetDate.getDate() === dayNum) {
              // For past dates in the current month, still use current year (user might want to see past events)
              // Only go to next year if the date is more than a month in the past
              const oneMonthAgo = new Date(now);
              oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
              
              if (targetDate < oneMonthAgo) {
                // Date is more than a month in the past, try next year
                targetDate = new Date(currentYear + 1, i, dayNum);
                // Verify the next year date is also valid
                if (targetDate.getDate() !== dayNum) {
                  // Invalid date in next year, use current year anyway
                  targetDate = new Date(currentYear, i, dayNum);
                }
              }
              
              const year = targetDate.getFullYear();
              const month = String(targetDate.getMonth() + 1).padStart(2, '0');
              const day = String(targetDate.getDate()).padStart(2, '0');
              parsedDate = `${year}-${month}-${day}`;
              
              logger.info(
                {
                  userId: this.userId,
                  originalTimeframe: timeframe,
                  matchedPattern: match[0],
                  dayNum,
                  monthIndex: i,
                  monthName: monthName,
                  monthAb: monthAb,
                  parsedDate,
                  targetDate: targetDate.toISOString(),
                },
                'Parsed specific date from timeframe'
              );
              
              break;
            }
          }
        }
      }
      
      // If no specific date found, try parsing as just a day number (e.g., "4th", "15")
      if (!parsedDate) {
        const dayOnlyMatch = timeframeLower.match(/(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?$/);
        if (dayOnlyMatch) {
          const dayNum = parseInt(dayOnlyMatch[1], 10);
          if (dayNum >= 1 && dayNum <= 31) {
            const now = new Date();
            const currentYear = now.getFullYear();
            
            // Try current month first
            let targetDate = new Date(currentYear, now.getMonth(), dayNum);
            if (targetDate.getDate() === dayNum && targetDate >= now) {
              const year = targetDate.getFullYear();
              const month = String(targetDate.getMonth() + 1).padStart(2, '0');
              const day = String(targetDate.getDate()).padStart(2, '0');
              parsedDate = `${year}-${month}-${day}`;
            } else {
              // If past, try next month
              const nextMonthDate = new Date(currentYear, now.getMonth() + 1, dayNum);
              if (nextMonthDate.getDate() === dayNum) {
                const year = nextMonthDate.getFullYear();
                const month = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
                const day = String(nextMonthDate.getDate()).padStart(2, '0');
                parsedDate = `${year}-${month}-${day}`;
              }
            }
          }
        }
      }
      
      // Map timeframe strings to queryTimeframe values (if not a specific date)
      let queryTimeframe: 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'all' | undefined;
      
      if (parsedDate) {
        // Specific date found, don't set queryTimeframe
        queryTimeframe = undefined;
      } else if (timeframeLower === 'today' || timeframeLower.includes("today's")) {
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
          parsedDate,
          mappedTimeframe: queryTimeframe,
        },
        'Timeframe mapped for calendar query'
      );
      
      // Create calendar intent for query
      const intent: CalendarIntent = {
        action: 'QUERY',
        confidence: 0.9,
        ...(queryTimeframe ? { queryTimeframe } : {}),
        ...(parsedDate ? { startDate: parsedDate } : {}),
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
        
        // Get calendar timezone for formatting events
        let calendarTimezone = 'Africa/Johannesburg'; // Default fallback
        try {
          const calendarService = new CalendarService(this.db);
          if (calendarConnection) {
            calendarTimezone = await (calendarService as any).getUserTimezone(this.userId, calendarConnection);
          }
        } catch (error) {
          logger.warn({ error, userId: this.userId }, 'Failed to get calendar timezone for event formatting, using default');
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
        
        // Format each event using calendar's timezone
        result.events.slice(0, 20).forEach((event: { title: string; start: Date; location?: string }, index: number) => {
          const eventTime = event.start.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: calendarTimezone,
          });
          const eventDate = event.start.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: calendarTimezone,
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

