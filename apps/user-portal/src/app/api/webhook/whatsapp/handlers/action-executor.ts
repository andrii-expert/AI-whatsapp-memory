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
      // Match: "List reminders: {all|active|paused|today|tomorrow|this week|this month}"
      const match = trimmed.match(/^List reminders:\s*(.+)$/i);
      if (match) {
        const filterText = match[1].trim().toLowerCase();
        // Check if it's a status filter
        if (filterText === 'active' || filterText === 'paused' || filterText === 'all') {
          status = filterText;
        } else {
          // It's a time-based filter (today, tomorrow, etc.)
          listFilter = filterText;
          status = 'all'; // Default status when using time filter
        }
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
            // Get user timezone for reminder filtering
            const user = await getUserById(this.db, this.userId);
            const userTimezone = (user as any)?.timezone;
            return await this.listReminders(parsed, userTimezone);
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

      const folderName = parsed.folderRoute || 'General';
      return {
        success: true,
        message: `✅ *New Task created:*\n"${parsed.taskName}"`,
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
        message: `📁 *New Notes Folder created:*\n"${parsed.folderRoute}"`,
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
        message: `✏️ *Task updated:*\n"${parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName}"`,
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
        message: `🗑️ *Task deleted:*\n"${parsed.taskName}"`,
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
        message: `✅ *Task completed:*\n"${parsed.taskName}"`,
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
        message: `📁 *New Notes Folder created:*\n"${parsed.newName}"`,
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
          message: `📋 *You have no tasks${folderText}${statusText}:*\n"None"`,
        };
      }

      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      const statusText = statusFilter ? ` (${statusFilter})` : '';
      let message = `📋 *Your tasks${folderText}${statusText}:*\n`;
      
      tasks.slice(0, 20).forEach((task, index) => {
        const statusIcon = task.status === 'completed' ? '✅' : '⏳';
        message += `${index + 1}. ${statusIcon} "${task.title}"\n`;
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
          message: `📝 *You have no notes${folderText}:*\n"None"`,
        };
      }

      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      let message = `📝 *Your notes${folderText}:*\n`;
      
      notes.slice(0, 20).forEach((note, index) => {
        const contentPreview = note.content ? (note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content) : '(no content)';
        message += `${index + 1}. "${note.title}"\n   ${contentPreview}\n`;
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

  private async listReminders(parsed: ParsedAction, userTimezone?: string): Promise<{ success: boolean; message: string }> {
    try {
      const reminders = await getRemindersByUserId(this.db, this.userId);

      // Filter by status if specified
      let filteredReminders = reminders;
      if (parsed.status && parsed.status !== 'all') {
        const isActive = parsed.status === 'active';
        filteredReminders = reminders.filter(r => r.active === isActive);
      }

      // Filter by time if specified (today, tomorrow, this week, this month)
      if (parsed.listFilter && userTimezone) {
        const timeFilter = parsed.listFilter.toLowerCase().trim();
        const now = new Date();
        
        // Get user's local time components using Intl.DateTimeFormat for reliable parsing
        const dateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false
        });
        
        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false
        });
        
        const dateParts = dateFormatter.formatToParts(now);
        const timeParts = timeFormatter.formatToParts(now);
        
        const userLocalTime = {
          year: parseInt(dateParts.find(p => p.type === 'year')?.value || '0', 10),
          month: parseInt(dateParts.find(p => p.type === 'month')?.value || '0', 10) - 1, // Month is 0-indexed
          day: parseInt(dateParts.find(p => p.type === 'day')?.value || '0', 10),
          hours: parseInt(timeParts.find(p => p.type === 'hour')?.value || '0', 10),
          minutes: parseInt(timeParts.find(p => p.type === 'minute')?.value || '0', 10),
          seconds: parseInt(timeParts.find(p => p.type === 'second')?.value || '0', 10),
          date: new Date(),
        };

        // Log for debugging
        logger.info({
          userId: this.userId,
          timeFilter,
          parsedListFilter: parsed.listFilter,
          userTimezone,
          userLocalTime,
          reminderCountBeforeFilter: filteredReminders.length,
        }, 'Filtering reminders by time');

        filteredReminders = filteredReminders.filter(reminder => {
          if (!reminder.active) return false;
          
          if (timeFilter === 'today' || timeFilter.includes('today')) {
            // For "today" filter, check if reminder is scheduled for today
            const isToday = this.isReminderScheduledForDate(reminder, userLocalTime, userTimezone);
            if (!isToday) {
              // Log why reminder was filtered out
              logger.info({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                reason: 'Next occurrence is not today',
              }, 'Reminder filtered out for today');
            }
            return isToday;
          }
          
          // For other filters, use next occurrence
          // Calculate next occurrence for this reminder
          const nextTime = this.calculateNextReminderTime(reminder, userLocalTime, userTimezone);
          if (!nextTime) return false;

          // Convert nextTime to user's timezone for comparison
          const nextTimeInUserTz = new Date(nextTime.toLocaleString("en-US", { timeZone: userTimezone }));
          const nextYear = nextTimeInUserTz.getFullYear();
          const nextMonth = nextTimeInUserTz.getMonth();
          const nextDay = nextTimeInUserTz.getDate();
          
          if (timeFilter === 'tomorrow' || timeFilter.includes('tomorrow')) {
            const tomorrow = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1);
            return nextYear === tomorrow.getFullYear() && 
                   nextMonth === tomorrow.getMonth() && 
                   nextDay === tomorrow.getDate();
          } else if (timeFilter.includes('this week') || timeFilter.includes('week')) {
            const weekStart = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6); // End of week (Saturday)
            const nextDate = new Date(nextYear, nextMonth, nextDay);
            return nextDate >= weekStart && nextDate <= weekEnd;
          } else if (timeFilter.includes('this month') || timeFilter.includes('month')) {
            return nextYear === userLocalTime.year && nextMonth === userLocalTime.month;
          } else if (timeFilter.includes('next week')) {
            const nextWeekStart = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day);
            nextWeekStart.setDate(nextWeekStart.getDate() - nextWeekStart.getDay() + 7); // Start of next week
            const nextWeekEnd = new Date(nextWeekStart);
            nextWeekEnd.setDate(nextWeekEnd.getDate() + 6); // End of next week
            const nextDate = new Date(nextYear, nextMonth, nextDay);
            return nextDate >= nextWeekStart && nextDate <= nextWeekEnd;
          }
          
          // If filter doesn't match known patterns, don't show any (filter is unknown)
          logger.warn({ timeFilter, userId: this.userId }, 'Unknown time filter, filtering out all reminders');
          return false;
        });
      }

      // Log filtered results
      logger.info({
        userId: this.userId,
        timeFilter: parsed.listFilter,
        reminderCountAfterFilter: filteredReminders.length,
        reminderCountBeforeFilter: reminders.length,
      }, 'Reminder filtering complete');

      if (filteredReminders.length === 0) {
        const statusText = parsed.status && parsed.status !== 'all' ? ` (${parsed.status})` : '';
        const timeText = parsed.listFilter ? ` for ${parsed.listFilter}` : '';
        return {
          success: true,
          message: `🔔 *You have no reminders${statusText}${timeText}:*\n"None"`,
        };
      }

      // Sort reminders by next occurrence time (if timezone is available)
      let remindersWithNextTime: Array<{ reminder: any; nextTime: Date }>;
      if (userTimezone) {
        const now = new Date();
        const userTimeString = now.toLocaleString("en-US", { timeZone: userTimezone });
        const userLocalTimeDate = new Date(userTimeString);
        const userLocalTime = {
          year: userLocalTimeDate.getFullYear(),
          month: userLocalTimeDate.getMonth(),
          day: userLocalTimeDate.getDate(),
          hours: userLocalTimeDate.getHours(),
          minutes: userLocalTimeDate.getMinutes(),
          seconds: userLocalTimeDate.getSeconds(),
          date: userLocalTimeDate,
        };
        remindersWithNextTime = filteredReminders.map(reminder => {
          const nextTime = this.calculateNextReminderTime(reminder, userLocalTime, userTimezone);
          return { reminder, nextTime: nextTime || new Date(0) };
        }).sort((a, b) => a.nextTime.getTime() - b.nextTime.getTime());
      } else {
        // If no timezone, just use reminders as-is without sorting by time
        remindersWithNextTime = filteredReminders.map(reminder => ({ reminder, nextTime: new Date(0) }));
      }

      const statusText = parsed.status && parsed.status !== 'all' ? ` (${parsed.status})` : '';
      const timeText = parsed.listFilter ? ` for ${parsed.listFilter}` : '';
      let message = `🔔 *Your reminders${statusText}${timeText}:*\n`;
      
      remindersWithNextTime.slice(0, 20).forEach(({ reminder, nextTime }, index) => {
        const statusIcon = reminder.active ? '🔔' : '⏸️';
        
        // Format next time in user's timezone
        let timeDisplay = '';
        if (nextTime && nextTime.getTime() > 0 && userTimezone) {
          const nextTimeInUserTz = new Date(nextTime.toLocaleString("en-US", { timeZone: userTimezone }));
          const hours = nextTimeInUserTz.getHours();
          const minutes = nextTimeInUserTz.getMinutes();
          const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
          const period = hours >= 12 ? 'PM' : 'AM';
          const dateStr = nextTimeInUserTz.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
          timeDisplay = ` at ${hour12}:${String(minutes).padStart(2, '0')} ${period} on ${dateStr}`;
        }
        
        message += `${index + 1}. ${statusIcon} "${reminder.title}${timeDisplay}"\n`;
      });

      if (remindersWithNextTime.length > 20) {
        message += `\n... and ${remindersWithNextTime.length - 20} more reminders.`;
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
   * Check if a reminder's next occurrence is on a specific date
   * This uses the actual next occurrence time, not just pattern matching
   */
  private isReminderScheduledForDate(
    reminder: any,
    userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
    userTimezone: string
  ): boolean {
    try {
      // Calculate the actual next occurrence time for this reminder
      const nextTime = this.calculateNextReminderTime(reminder, userLocalTime, userTimezone);
      if (!nextTime) {
        return false;
      }

      // Convert next occurrence to user's timezone for comparison
      // Use Intl.DateTimeFormat to get date components in user's timezone
      const nextTimeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      
      const nextTimeParts = nextTimeFormatter.formatToParts(nextTime);
      const nextYear = parseInt(nextTimeParts.find(p => p.type === 'year')?.value || '0', 10);
      const nextMonth = parseInt(nextTimeParts.find(p => p.type === 'month')?.value || '0', 10) - 1; // Month is 0-indexed
      const nextDay = parseInt(nextTimeParts.find(p => p.type === 'day')?.value || '0', 10);

      // Check if the next occurrence is today
      const isToday = nextYear === userLocalTime.year &&
                      nextMonth === userLocalTime.month &&
                      nextDay === userLocalTime.day;

      return isToday;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if reminder is scheduled for date');
      return false;
    }
  }

  /**
   * Calculate the next occurrence time for a reminder in user's timezone
   */
  private calculateNextReminderTime(
    reminder: any,
    userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
    userTimezone: string
  ): Date | null {
    // Reuse the logic from the cron job's calculateReminderTime function
    // This is a simplified version that calculates the next occurrence
    try {
      if (reminder.frequency === 'daily' && reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        const todayReminder = this.createDateInUserTimezone(userLocalTime.year, userLocalTime.month, userLocalTime.day, hours, minutes, userTimezone);
        // If reminder time today has passed, use tomorrow
        if (todayReminder.getTime() <= userLocalTime.date.getTime()) {
          const tomorrow = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1);
          return this.createDateInUserTimezone(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), hours, minutes, userTimezone);
        }
        return todayReminder;
      } else if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0 && reminder.time) {
        const [hours, minutes] = reminder.time.split(':').map(Number);
        const currentDayOfWeek = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day).getDay();
        // Find the next occurrence day
        const sortedDays = [...reminder.daysOfWeek].sort((a, b) => a - b);
        let daysToAdd = 0;
        for (const day of sortedDays) {
          if (day > currentDayOfWeek) {
            daysToAdd = day - currentDayOfWeek;
            break;
          }
        }
        // If no day found this week, use first day of next week
        if (daysToAdd === 0) {
          daysToAdd = 7 - currentDayOfWeek + sortedDays[0];
        }
        const targetDate = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + daysToAdd);
        const targetReminder = this.createDateInUserTimezone(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), hours, minutes, userTimezone);
        // If today is one of the reminder days and time hasn't passed, use today
        if (reminder.daysOfWeek.includes(currentDayOfWeek)) {
          const todayReminder = this.createDateInUserTimezone(userLocalTime.year, userLocalTime.month, userLocalTime.day, hours, minutes, userTimezone);
          if (todayReminder.getTime() > userLocalTime.date.getTime()) {
            return todayReminder;
          }
        }
        return targetReminder;
      } else if (reminder.frequency === 'monthly' && reminder.dayOfMonth) {
        const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
        let targetYear = userLocalTime.year;
        let targetMonth = userLocalTime.month;
        let targetDay = Number(reminder.dayOfMonth);
        if (targetDay < userLocalTime.day) {
          targetMonth += 1;
          if (targetMonth > 11) {
            targetMonth = 0;
            targetYear += 1;
          }
        }
        return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
      } else if (reminder.frequency === 'yearly' && reminder.month && reminder.dayOfMonth) {
        const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
        let targetYear = userLocalTime.year;
        const targetMonth = Number(reminder.month) - 1; // Convert 1-12 to 0-11
        const targetDay = Number(reminder.dayOfMonth);
        if (targetMonth < userLocalTime.month || (targetMonth === userLocalTime.month && targetDay < userLocalTime.day)) {
          targetYear += 1;
        }
        return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
      } else if (reminder.frequency === 'once') {
        if (reminder.targetDate) {
          const target = new Date(reminder.targetDate);
          const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
          return this.createDateInUserTimezone(
            target.getUTCFullYear(),
            target.getUTCMonth(),
            target.getUTCDate(),
            hours,
            minutes,
            userTimezone
          );
        } else if (reminder.daysFromNow !== undefined) {
          const targetDate = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + reminder.daysFromNow);
          const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
          return this.createDateInUserTimezone(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            hours,
            minutes,
            userTimezone
          );
        }
      }
      return null;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error calculating next reminder time');
      return null;
    }
  }

  /**
   * Get current time components in user's timezone
   */
  private getCurrentTimeInTimezone(timezone?: string): {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  } {
    const now = new Date();
    
    if (timezone) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
      });
      
      const parts = formatter.formatToParts(now);
      const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
      
      return {
        year: parseInt(getPart('year'), 10),
        month: parseInt(getPart('month'), 10) - 1, // Month is 0-indexed
        day: parseInt(getPart('day'), 10),
        hour: parseInt(getPart('hour'), 10),
        minute: parseInt(getPart('minute'), 10),
        second: parseInt(getPart('second'), 10),
      };
    } else {
      // No timezone, use UTC as fallback
      return {
        year: now.getUTCFullYear(),
        month: now.getUTCMonth(),
        day: now.getUTCDate(),
        hour: now.getUTCHours(),
        minute: now.getUTCMinutes(),
        second: now.getUTCSeconds(),
      };
    }
  }

  /**
   * Create a Date object representing a time in the user's local timezone
   */
  private createDateInUserTimezone(
    year: number,
    month: number,
    day: number,
    hours: number,
    minutes: number,
    timezone: string
  ): Date {
    // Create a date string in ISO format
    const isoString = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
    
    // Create a date as if the time is in UTC
    let candidate = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
    
    // Check what this represents in the user's timezone
    let candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
    
    // Get what we got
    let gotYear = candidateInUserTz.getFullYear();
    let gotMonth = candidateInUserTz.getMonth();
    let gotDay = candidateInUserTz.getDate();
    let gotHours = candidateInUserTz.getHours();
    let gotMinutes = candidateInUserTz.getMinutes();
    
    // If it matches, we're done
    if (gotYear === year && gotMonth === month && gotDay === day && gotHours === hours && gotMinutes === minutes) {
      return candidate;
    }
    
    // Calculate the offset needed
    const targetMs = new Date(year, month, day, hours, minutes, 0, 0).getTime();
    const gotMs = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
    const diff = targetMs - gotMs;
    
    // Adjust candidate
    candidate = new Date(candidate.getTime() + diff);
    
    // Verify one more time
    candidateInUserTz = new Date(candidate.toLocaleString("en-US", { timeZone: timezone }));
    gotYear = candidateInUserTz.getFullYear();
    gotMonth = candidateInUserTz.getMonth();
    gotDay = candidateInUserTz.getDate();
    gotHours = candidateInUserTz.getHours();
    gotMinutes = candidateInUserTz.getMinutes();
    
    if (
      gotYear === year &&
      gotMonth === month &&
      gotDay === day &&
      gotHours === hours &&
      gotMinutes === minutes
    ) {
      return candidate;
    }
    
    // Final adjustment if needed
    const targetMs2 = new Date(year, month, day, hours, minutes, 0, 0).getTime();
    const gotMs2 = new Date(gotYear, gotMonth, gotDay, gotHours, gotMinutes, 0, 0).getTime();
    const diff2 = targetMs2 - gotMs2;
    
    return new Date(candidate.getTime() + diff2);
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
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Check for "every [day]" pattern first (e.g., "every tuesday", "every monday")
    const everyDayMatch = scheduleLower.match(/every\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
    if (everyDayMatch && everyDayMatch[1]) {
      result.frequency = 'weekly';
      const dayIndex = dayNames.indexOf(everyDayMatch[1].toLowerCase());
      if (dayIndex !== -1) {
        result.daysOfWeek = [dayIndex];
      }
      // Extract time if present
      const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (timeMatch && timeMatch[1]) {
        result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
      } else {
        // Default to 9am if no time specified
        result.time = '09:00';
      }
      return result;
    }

    // Check for recurring patterns
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
      
      // Check for relative time patterns (e.g., "in 5 mins", "in 10 minutes", "in 2 hours")
      const relativeTimeMatch = scheduleLower.match(/in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)/i);
      if (relativeTimeMatch && relativeTimeMatch[1] && relativeTimeMatch[2]) {
        const amount = parseInt(relativeTimeMatch[1], 10);
        const unit = relativeTimeMatch[2].toLowerCase();
        
        if (timezone) {
          // Get current time components in user's timezone
          const currentTime = this.getCurrentTimeInTimezone(timezone);
          const currentYear = currentTime.year;
          const currentMonth = currentTime.month;
          const currentDay = currentTime.day;
          const currentHour = currentTime.hour;
          const currentMinute = currentTime.minute;
          
          // Calculate target time by adding duration
          let targetYear = currentYear;
          let targetMonth = currentMonth;
          let targetDay = currentDay;
          let targetHour = currentHour;
          let targetMinute = currentMinute;
          
          // Add duration based on unit
          if (unit.startsWith('min')) {
            targetMinute += amount;
          } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
            targetHour += amount;
          } else if (unit.startsWith('day')) {
            targetDay += amount;
          }
          
          // Handle overflow
          if (targetMinute >= 60) {
            targetHour += Math.floor(targetMinute / 60);
            targetMinute = targetMinute % 60;
          }
          if (targetHour >= 24) {
            targetDay += Math.floor(targetHour / 24);
            targetHour = targetHour % 24;
          }
          // Note: Day/month overflow is handled by createDateInUserTimezone
          
          // Create target date in user's timezone using the helper method
          const targetDateInUserTz = this.createDateInUserTimezone(
            targetYear,
            targetMonth,
            targetDay,
            targetHour,
            targetMinute,
            timezone
          );
          
          // Set targetDate and time (targetDate must be a Date object, not a string)
          result.targetDate = targetDateInUserTz;
          result.time = `${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}`;
        } else {
          // No timezone provided, use UTC as fallback
          const now = new Date();
          
          // Calculate duration in milliseconds
          let durationMs: number;
          if (unit.startsWith('min')) {
            durationMs = amount * 60 * 1000;
          } else if (unit.startsWith('hour') || unit.startsWith('hr')) {
            durationMs = amount * 60 * 60 * 1000;
          } else if (unit.startsWith('day')) {
            durationMs = amount * 24 * 60 * 60 * 1000;
          } else {
            durationMs = amount * 60 * 1000; // Default to minutes
          }
          
          // Calculate target timestamp
          const targetDate = new Date(now.getTime() + durationMs);
          
          result.targetDate = targetDate;
          result.time = `${String(targetDate.getUTCHours()).padStart(2, '0')}:${String(targetDate.getUTCMinutes()).padStart(2, '0')}`;
        }
        
        logger.info(
          {
            scheduleStr: schedule,
            amount,
            unit,
            timezone,
            targetDate: result.targetDate,
            time: result.time,
          },
          'Parsed relative time reminder'
        );
        
        return result;
      }
      
      // Check for relative dates
      if (scheduleLower.includes('tomorrow')) {
        if (timezone) {
          // Calculate tomorrow in user's timezone
          const currentTime = this.getCurrentTimeInTimezone(timezone);
          let targetTime = '09:00'; // Default time
          
          // Extract time based on time of day or explicit time
          if (scheduleLower.includes('morning')) {
            targetTime = '09:00';
          } else if (scheduleLower.includes('afternoon')) {
            targetTime = '14:00';
          } else if (scheduleLower.includes('evening') || scheduleLower.includes('night')) {
            targetTime = '18:00';
          } else {
            const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
            if (timeMatch && timeMatch[1]) {
              targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
            }
          }
          
          const [hours, minutes] = targetTime.split(':').map(Number);
          const tomorrowDate = new Date(currentTime.year, currentTime.month, currentTime.day + 1);
          
          result.targetDate = this.createDateInUserTimezone(
            tomorrowDate.getFullYear(),
            tomorrowDate.getMonth(),
            tomorrowDate.getDate(),
            hours,
            minutes,
            timezone
          );
          result.time = targetTime;
        } else {
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
        }
      } else if (scheduleLower.includes('today') || scheduleLower.includes('tonight')) {
        if (timezone) {
          // Calculate today in user's timezone
          const currentTime = this.getCurrentTimeInTimezone(timezone);
          let targetTime: string | undefined;
          
          if (scheduleLower.includes('tonight') || scheduleLower.includes('night')) {
            targetTime = '18:00';
          } else {
            const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
            if (timeMatch && timeMatch[1]) {
              targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
            }
          }
          
          if (targetTime) {
            const [hours, minutes] = targetTime.split(':').map(Number);
            result.targetDate = this.createDateInUserTimezone(
              currentTime.year,
              currentTime.month,
              currentTime.day,
              hours,
              minutes,
              timezone
            );
            result.time = targetTime;
          } else {
            result.daysFromNow = 0;
          }
        } else {
          result.daysFromNow = 0;
          if (scheduleLower.includes('tonight') || scheduleLower.includes('night')) {
            result.time = '18:00';
          } else {
            const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
            if (timeMatch && timeMatch[1]) {
              result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
            }
          }
        }
      } else if (scheduleLower.includes('later')) {
        // "later" means once, no specific time/date
        result.frequency = 'once';
      } else {
        // Extract time
        const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch && timeMatch[1]) {
          const parsedTime = this.parseTimeTo24Hour(timeMatch[1].trim());
          result.time = parsedTime;
          
          // If time is specified and we have timezone, calculate targetDate for today
          if (timezone) {
            const currentTime = this.getCurrentTimeInTimezone(timezone);
            const [hours, minutes] = parsedTime.split(':').map(Number);
            result.targetDate = this.createDateInUserTimezone(
              currentTime.year,
              currentTime.month,
              currentTime.day,
              hours,
              minutes,
              timezone
            );
          }
        }
        
        // Check for specific date (e.g., "on the 1st")
        const dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
        if (dayMatch && dayMatch[1]) {
          const dayNum = parseInt(dayMatch[1], 10);
          if (dayNum >= 1 && dayNum <= 31) {
            if (timezone) {
              const currentTime = this.getCurrentTimeInTimezone(timezone);
              const currentDay = currentTime.day;
              const currentMonth = currentTime.month; // 0-indexed (0-11)
              
              // If day is in the past this month, schedule for next month
              if (dayNum < currentDay) {
                result.dayOfMonth = dayNum;
                // Next month (currentMonth + 1), convert to 1-12 for database
                result.month = currentMonth + 2 > 11 ? 1 : currentMonth + 2;
              } else {
                result.dayOfMonth = dayNum;
                // Current month (currentMonth + 1), convert to 1-12 for database
                result.month = currentMonth + 1;
              }
            } else {
              const now = new Date();
              const currentDay = now.getDate();
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
      logger.info(
        {
          userId: this.userId,
          parsed,
          taskName: parsed.taskName,
          listFilter: parsed.listFilter,
          status: parsed.status,
          timezone,
        },
        'createReminder called'
      );

      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know what you want to be reminded about. Please provide a reminder title.",
        };
      }

      const scheduleStr = parsed.listFilter || 'once';
      logger.info(
        {
          userId: this.userId,
          scheduleStr,
          timezone,
        },
        'Parsing reminder schedule'
      );

      const scheduleData = this.parseReminderSchedule(scheduleStr, timezone);
      
      // Auto-detect birthday and set to yearly
      const titleLower = parsed.taskName.toLowerCase();
      const isBirthday = titleLower.includes('birthday') || titleLower.includes('birth day');
      
      if (isBirthday) {
        // Override frequency to yearly for birthdays
        scheduleData.frequency = 'yearly';
        
        // Try to extract date from schedule string (e.g., "on the 4th October", "4th October", "October 4th")
        const dateMatch = scheduleStr.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i) 
          || scheduleStr.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?/i);
        
        if (dateMatch) {
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
          let dayNum: number;
          let monthName: string;
          
          if (dateMatch[1] && monthNames.includes(dateMatch[1].toLowerCase())) {
            // Format: "October 4th"
            monthName = dateMatch[1].toLowerCase();
            dayNum = parseInt(dateMatch[2] || '1', 10);
          } else {
            // Format: "4th October"
            dayNum = parseInt(dateMatch[1] || '1', 10);
            monthName = dateMatch[2]?.toLowerCase() || '';
          }
          
          if (monthName && dayNum >= 1 && dayNum <= 31) {
            const monthIndex = monthNames.indexOf(monthName);
            if (monthIndex !== -1) {
              scheduleData.dayOfMonth = dayNum;
              scheduleData.month = monthIndex + 1; // 1-12
            }
          }
        }
        
        // Default time to 9am for birthdays if not specified
        if (!scheduleData.time) {
          scheduleData.time = '09:00';
        }
      }
      
      logger.info(
        {
          userId: this.userId,
          scheduleStr,
          parsedSchedule: scheduleData,
          frequency: scheduleData.frequency,
          daysOfWeek: scheduleData.daysOfWeek,
          time: scheduleData.time,
          isBirthday,
          dayOfMonth: scheduleData.dayOfMonth,
          month: scheduleData.month,
        },
        'Parsed reminder schedule'
      );
      
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

      logger.info(
        {
          userId: this.userId,
          reminderInput: {
            ...reminderInput,
            targetDate: reminderInput.targetDate?.toISOString(),
          },
        },
        'Creating reminder with input'
      );

      const reminder = await createReminder(this.db, reminderInput);

      logger.info({ userId: this.userId, reminderId: reminder.id, timezone }, 'Reminder created');

      // Format response message
      const timeParts = reminder.time ? reminder.time.split(':') : null;
      let timeInfo = '';
      if (timeParts) {
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const period = hours >= 12 ? 'PM' : 'AM';
        timeInfo = ` at ${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
      }
      const responseMessage = `🔔 *Reminder created:*\n"${reminder.title}${timeInfo}"`;

      return {
        success: true,
        message: responseMessage,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        {
          error,
          errorMessage,
          errorStack,
          userId: this.userId,
          parsed,
          timezone,
        },
        'Failed to create reminder'
      );
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

      // Format response message
      const timeToDisplay = updated.time || reminder.time;
      const timeParts = timeToDisplay ? timeToDisplay.split(':') : null;
      let timeInfo = '';
      if (timeParts) {
        const hours = parseInt(timeParts[0] || '0', 10);
        const minutes = parseInt(timeParts[1] || '0', 10);
        const hour12 = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
        const period = hours >= 12 ? 'PM' : 'AM';
        timeInfo = ` at ${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
      }
      const responseMessage = `🔔 *Reminder updated:*\n"${updated.title || reminder.title}${timeInfo}"`;

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
        message: `🔔 *Reminder deleted:*\n"${reminder.title}"`,
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
        message: `⏸️ *Reminder paused:*\n"${reminder.title}"`,
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
        message: `▶️ *Reminder resumed:*\n"${reminder.title}"`,
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
          
          const titleText = timeframeText === 'upcoming' 
            ? 'You have no events scheduled'
            : `You have no events scheduled ${timeframeText}`;
          
          return {
            success: true,
            message: `📅 *${titleText}:*\n"None"`,
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
        
        const timeframeText = queryTimeframe === 'today' ? 'today' 
          : queryTimeframe === 'tomorrow' ? 'tomorrow'
          : queryTimeframe === 'this_week' ? 'this week'
          : queryTimeframe === 'this_month' ? 'this month'
          : 'all';
        
        const titleText = timeframeText === 'all' 
          ? `You have ${result.events.length} event${result.events.length !== 1 ? 's' : ''}`
          : `Your events ${timeframeText}`;
        
        let message = `📅 *${titleText}:*\n`;
        
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
          
          const locationText = event.location ? ` at ${event.location}` : '';
          message += `${index + 1}. "${event.title}"\n   ${eventDate} at ${eventTime}${locationText}\n`;
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

