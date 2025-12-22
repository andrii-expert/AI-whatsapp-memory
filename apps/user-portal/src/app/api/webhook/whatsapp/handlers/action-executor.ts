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
  getFolderById,
  getUserTasks,
  getUserNotes,
  deleteNote,
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
import {
  getUserFiles,
  getUserFileById,
  createUserFile,
  updateUserFile,
  deleteUserFile,
  getUserFileFolders,
  createUserFileFolder,
  updateUserFileFolder,
  deleteUserFileFolder,
} from '@imaginecalendar/database/queries';
import {
  createFileShare,
  searchUsersForFileSharing,
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getAddressById,
  createShoppingListItem,
  getUserShoppingListItems,
  updateShoppingListItem,
  deleteShoppingListItem,
  toggleShoppingListItemStatus,
  getUserShoppingListFolders,
  createShoppingListFolder,
  updateShoppingListFolder,
  deleteShoppingListFolder,
  getShoppingListFolderById,
  getUserFriends,
  getFriendById,
  createFriend,
  updateFriend,
  deleteFriend,
  getUserFriendFolders,
  createFriendFolder,
  updateFriendFolder,
  deleteFriendFolder,
  getFriendFolderById,
  searchUsersByEmailOrPhoneForFriends,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { CalendarService } from './calendar-service';
import type { CalendarIntent } from '@imaginecalendar/ai-services';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ParsedAction {
  action: string;
  resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event' | 'document' | 'address' | 'friend';
  taskName?: string;
  folderName?: string;
  folderRoute?: string;
  targetFolderRoute?: string;
  recipient?: string;
  newName?: string;
  status?: string;
  listFilter?: string; // For list operations: 'all', folder name, status, etc.
  typeFilter?: ReminderFrequency; // For reminder type filtering: 'daily', 'hourly', etc.
  missingFields: string[];
  isFileFolder?: boolean; // True if this is a file folder operation (vs task folder)
  isShoppingListFolder?: boolean; // True if this is a shopping list folder operation (vs task folder)
  isFriendFolder?: boolean; // True if this is a friend folder operation
  addressName?: string; // For address operations: the person/place name
  addressType?: string; // For address operations: 'location', 'address', 'pin', 'all'
  email?: string; // For friend operations: email address
  phone?: string; // For friend operations: phone number
  street?: string; // For friend/address operations: street address
  city?: string; // For friend/address operations: city
  state?: string; // For friend/address operations: state
  zip?: string; // For friend/address operations: zip code
  country?: string; // For friend/address operations: country
  latitude?: number; // For friend/address operations: latitude
  longitude?: number; // For friend/address operations: longitude
  friendAddressType?: 'home' | 'office' | 'parents_house'; // For friend operations: address type
  permission?: 'view' | 'edit'; // For share operations: permission level
  itemNumbers?: number[]; // For deletion by numbers: [1, 3, 5]
}

// In-memory cache to store last displayed list context for each user
// Key: userId, Value: { type: 'tasks' | 'notes' | 'shopping', items: Array<{ id: string, number: number, name?: string }> }
const listContextCache = new Map<string, { type: 'tasks' | 'notes' | 'shopping', items: Array<{ id: string, number: number, name?: string }>, folderRoute?: string }>();
const LIST_CONTEXT_TTL = 10 * 60 * 1000; // 10 minutes

export class ActionExecutor {
  constructor(
    private db: Database,
    private userId: string,
    private whatsappService: WhatsAppService,
    private recipient: string
  ) {}
  
  /**
   * Store list context for number-based deletion
   */
  private storeListContext(type: 'tasks' | 'notes' | 'shopping', items: Array<{ id: string, number: number, name?: string }>, folderRoute?: string): void {
    listContextCache.set(this.userId, { type, items, folderRoute });
    // Auto-cleanup after TTL
    setTimeout(() => {
      listContextCache.delete(this.userId);
    }, LIST_CONTEXT_TTL);
  }
  
  /**
   * Get list context for number-based deletion
   */
  private getListContext(): { type: 'tasks' | 'notes' | 'shopping', items: Array<{ id: string, number: number, name?: string }>, folderRoute?: string } | null {
    return listContextCache.get(this.userId) || null;
  }
  
  /**
   * Clear list context
   */
  private clearListContext(): void {
    listContextCache.delete(this.userId);
  }

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
    let resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event' | 'document' | 'address' | 'friend' = 'task';
    let taskName: string | undefined;
    let folderName: string | undefined;
    let folderRoute: string | undefined;
    let targetFolderRoute: string | undefined;
    let recipient: string | undefined;
    let newName: string | undefined;
    let status: string | undefined;
    let listFilter: string | undefined;
    let typeFilter: ReminderFrequency | undefined;
    let isShoppingListFolder: boolean | undefined;
    let isFriendFolder: boolean | undefined;
    let email: string | undefined;
    let phone: string | undefined;
    let street: string | undefined;
    let city: string | undefined;
    let state: string | undefined;
    let zip: string | undefined;
    let country: string | undefined;
    let latitude: number | undefined;
    let longitude: number | undefined;
    let friendAddressType: 'home' | 'office' | 'parents_house' | undefined;
    let permission: 'view' | 'edit' | undefined;

    // Shopping item operations (check before regular task)
    if (trimmed.startsWith('Create a shopping item:')) {
      action = 'create_shopping_item';
      resourceType = 'task';
      // Try full format first: "Create a shopping item: {item} - on folder: Shopping Lists"
      const fullMatch = trimmed.match(/^Create a shopping item:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (fullMatch) {
        taskName = fullMatch[1].trim();
        folderRoute = fullMatch[2].trim();
      } else {
        // Fallback: just extract the item name after "Create a shopping item:"
        const simpleMatch = trimmed.match(/^Create a shopping item:\s*(.+)$/i);
        if (simpleMatch) {
          taskName = simpleMatch[1].trim();
          // Don't set default folder - let it be undefined so item goes to root
          folderRoute = undefined;
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
      // Check if it's a number-based deletion (e.g., "Delete a task: 1,3,5" or "Delete a task: 1 and 3")
      const numberMatch = trimmed.match(/^Delete a task:\s*([\d\s,]+(?:and\s*\d+)?)\s*(?:-\s*on folder:\s*(.+))?$/i);
      if (numberMatch) {
        const numbersStr = numberMatch[1].trim();
        // Extract numbers from string like "1,3,5" or "1 and 3" or "1, 3, 5"
        const numbers = numbersStr
          .split(/[,\s]+|and\s+/i)
          .map(n => parseInt(n.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        
        if (numbers.length > 0) {
          // This is a number-based deletion
          const parsed: ParsedAction = {
            action: 'delete',
            resourceType: 'task',
            itemNumbers: numbers,
            folderRoute: numberMatch[2]?.trim(),
            missingFields: [],
          };
          return parsed;
        }
      }
      
      // Regular name-based deletion
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
      // Try to match with permission first
      let match = trimmed.match(/^Share a task:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*on folder:\s*(.+?)\s*-\s*permission:\s*(view|edit)$/i);
      if (match) {
        taskName = match[1].trim();
        recipient = match[2].trim();
        folderRoute = match[3].trim();
        permission = (match[4].trim().toLowerCase() === 'edit' ? 'edit' : 'view') as 'view' | 'edit';
      } else {
        // Fallback: match without permission
        match = trimmed.match(/^Share a task:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
        if (match) {
          taskName = match[1].trim();
          recipient = match[2].trim();
          folderRoute = match[3].trim();
          // Check for permission keywords, default to 'edit'
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.includes('permission: view') || lowerTrimmed.includes('view permission')) {
            permission = 'view';
          } else {
            permission = 'edit'; // Default to edit
          }
        } else {
          missingFields.push('task name, recipient, or folder');
        }
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
    } else if (trimmed.startsWith('Delete a note:')) {
      action = 'delete';
      resourceType = 'note';
      // Check if it's a number-based deletion (e.g., "Delete a note: 1,3,5" or "Delete a note: 1 and 3")
      const numberMatch = trimmed.match(/^Delete a note:\s*([\d\s,]+(?:and\s*\d+)?)\s*(?:-\s*folder:\s*(.+))?$/i);
      if (numberMatch) {
        const numbersStr = numberMatch[1].trim();
        // Extract numbers from string like "1,3,5" or "1 and 3" or "1, 3, 5"
        const numbers = numbersStr
          .split(/[,\s]+|and\s+/i)
          .map(n => parseInt(n.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        
        if (numbers.length > 0) {
          // This is a number-based deletion
          const parsed: ParsedAction = {
            action: 'delete',
            resourceType: 'note',
            itemNumbers: numbers,
            folderRoute: numberMatch[2]?.trim(),
            missingFields: [],
          };
          return parsed;
        }
      }
      
      // Regular name-based deletion
      const match = trimmed.match(/^Delete a note:\s*(.+?)\s*(?:-\s*folder:\s*(.+))?$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for note title
        folderRoute = match[2]?.trim();
      } else {
        missingFields.push('note title or folder');
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
      // Match: "List reminders: {all|active|paused|today|tomorrow|this week|this month|daily|hourly|weekly|monthly|yearly|once|minutely}"
      // Also supports combinations like "active daily" or "daily today"
      const match = trimmed.match(/^List reminders:\s*(.+)$/i);
      if (match) {
        const filterText = match[1].trim().toLowerCase();
        const filterParts = filterText.split(/\s+/);
        
        logger.debug({
          filterText,
          filterParts,
          originalMatch: match[1],
        }, 'Parsing reminder list filter');
        
        // Check for reminder type filter
        const reminderTypes: ReminderFrequency[] = ['daily', 'hourly', 'minutely', 'once', 'weekly', 'monthly', 'yearly'];
        for (const part of filterParts) {
          const matchedType = reminderTypes.find(type => part === type || part.includes(type));
          if (matchedType) {
            typeFilter = matchedType;
            break;
          }
        }
        
        // Check for status filter
        if (filterParts.includes('active')) {
          status = 'active';
        } else if (filterParts.includes('paused') || filterParts.includes('inactive')) {
          status = 'paused';
        } else if (filterParts.includes('all')) {
          status = 'all';
        }
        
        // Check for time-based filter (today, tomorrow, this week, this month)
        // Check longer phrases first to avoid partial matches
        const timeFilters = ['this month', 'this week', 'next week', 'tomorrow', 'today'];
        for (const timeFilter of timeFilters) {
          if (filterText.includes(timeFilter)) {
            listFilter = timeFilter;
            break;
          }
        }
        
        // Also check for variations like "all reminders today" -> extract "today"
        if (!listFilter) {
          const todayMatch = filterText.match(/\b(today|tomorrow|this\s+week|this\s+month|next\s+week)\b/i);
          if (todayMatch && todayMatch[1]) {
            listFilter = todayMatch[1].toLowerCase();
          }
        }
        
        // If no specific filters found, check if the whole text is a single filter
        if (!typeFilter && !status && !listFilter) {
          if (filterText === 'active' || filterText === 'paused' || filterText === 'all') {
            status = filterText;
          } else if (timeFilters.some(tf => filterText === tf)) {
            listFilter = filterText;
          } else {
            // Try to match as reminder type
            const matchedType = reminderTypes.find(type => filterText === type);
            if (matchedType) {
              typeFilter = matchedType;
            }
          }
        }
        
        logger.info({
          parsedFilter: {
            listFilter,
            status,
            typeFilter,
            filterText,
          },
        }, 'Parsed reminder list filter');
        
        // Default to 'all' status if not specified
        if (!status) {
          status = 'all';
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
    // Document operations
    else if (trimmed.startsWith('Create a file:')) {
      action = 'create';
      resourceType = 'document';
      const match = trimmed.match(/^Create a file:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        folderRoute = match[2].trim();
      } else {
        missingFields.push('file name or folder');
      }
    } else if (trimmed.startsWith('Edit a file:')) {
      action = 'edit';
      resourceType = 'document';
      const match = trimmed.match(/^Edit a file:\s*(.+?)\s*-\s*to:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        newName = match[2].trim();
        folderRoute = match[3].trim();
      } else {
        missingFields.push('file name, new name, or folder');
      }
    } else if (trimmed.startsWith('Delete a file:')) {
      action = 'delete';
      resourceType = 'document';
      const match = trimmed.match(/^Delete a file:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        folderRoute = match[2].trim();
      } else {
        missingFields.push('file name or folder');
      }
    } else if (trimmed.startsWith('View a file:')) {
      action = 'view';
      resourceType = 'document';
      const match = trimmed.match(/^View a file:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        folderRoute = match[2].trim();
      } else {
        missingFields.push('file name or folder');
      }
    } else if (trimmed.startsWith('Move a file:')) {
      action = 'move';
      resourceType = 'document';
      const match = trimmed.match(/^Move a file:\s*(.+?)\s*-\s*to folder:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        targetFolderRoute = match[2].trim();
      } else {
        missingFields.push('file name or target folder');
      }
    } else if (trimmed.startsWith('Share a file:')) {
      action = 'share';
      resourceType = 'document';
      // Try to match with permission first
      let match = trimmed.match(/^Share a file:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*on folder:\s*(.+?)\s*-\s*permission:\s*(view|edit)$/i);
      if (match) {
        taskName = match[1].trim(); // Reuse taskName for fileName
        recipient = match[2].trim();
        folderRoute = match[3].trim();
        permission = (match[4].trim().toLowerCase() === 'edit' ? 'edit' : 'view') as 'view' | 'edit';
      } else {
        // Fallback: match without permission
        match = trimmed.match(/^Share a file:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
        if (match) {
          taskName = match[1].trim(); // Reuse taskName for fileName
          recipient = match[2].trim();
          folderRoute = match[3].trim();
          // Check for permission keywords, default to 'edit'
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.includes('permission: view') || lowerTrimmed.includes('view permission')) {
            permission = 'view';
          } else {
            permission = 'edit'; // Default to edit
          }
        } else {
          missingFields.push('file name, recipient, or folder');
        }
      }
    } else if (trimmed.startsWith('List files:')) {
      action = 'list';
      resourceType = 'document';
      const match = trimmed.match(/^List files:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        missingFields.push('folder or "all"');
      }
    } else if (trimmed.startsWith('Create a file folder:')) {
      action = 'create';
      resourceType = 'folder';
      const match = trimmed.match(/^Create a file folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Edit a file folder:')) {
      action = 'edit';
      resourceType = 'folder';
      const match = trimmed.match(/^Edit a file folder:\s*(.+?)\s*-\s*to:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
        newName = match[2].trim();
      } else {
        missingFields.push('folder name or new name');
      }
      // Mark as file folder operation - will be handled in return statement
    } else if (trimmed.startsWith('Delete a file folder:')) {
      action = 'delete';
      resourceType = 'folder';
      const match = trimmed.match(/^Delete a file folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
      // Mark as file folder operation - will be handled in return statement
    } else if (trimmed.startsWith('Share a file folder:')) {
      action = 'share';
      resourceType = 'folder';
      // Try to match with permission first
      let match = trimmed.match(/^Share a file folder:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*permission:\s*(view|edit)$/i);
      if (match) {
        folderRoute = match[1].trim();
        recipient = match[2].trim();
        permission = (match[3].trim().toLowerCase() === 'edit' ? 'edit' : 'view') as 'view' | 'edit';
      } else {
        // Fallback: match without permission
        match = trimmed.match(/^Share a file folder:\s*(.+?)\s*-\s*with:\s*(.+)$/i);
        if (match) {
          folderRoute = match[1].trim();
          recipient = match[2].trim();
          // Check for permission keywords, default to 'edit'
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.includes('permission: view') || lowerTrimmed.includes('view permission')) {
            permission = 'view';
          } else {
            permission = 'edit'; // Default to edit
          }
        } else {
          missingFields.push('folder name or recipient');
        }
      }
      // Mark as file folder operation - will be handled in return statement
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
      // Try to match with permission first
      let match = trimmed.match(/^Share a task folder:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*permission:\s*(view|edit)$/i);
      if (match) {
        folderRoute = match[1].trim();
        recipient = match[2].trim();
        permission = (match[3].trim().toLowerCase() === 'edit' ? 'edit' : 'view') as 'view' | 'edit';
      } else {
        // Fallback: match without permission
        match = trimmed.match(/^Share a task folder:\s*(.+?)\s*-\s*with:\s*(.+)$/i);
        if (match) {
          folderRoute = match[1].trim();
          recipient = match[2].trim();
          // Check for permission keywords, default to 'edit'
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerTrimmed.includes('permission: view') || lowerTrimmed.includes('view permission')) {
            permission = 'view';
          } else {
            permission = 'edit'; // Default to edit
          }
        } else {
          missingFields.push('folder name or recipient');
        }
      }
    } else if (trimmed.startsWith('Share a shopping list folder:')) {
      action = 'share';
      resourceType = 'folder';
      isShoppingListFolder = true;
      // Try to match with permission first: "Share a shopping list folder: {folder} - with: {recipient} - permission: {view|edit}"
      let match = trimmed.match(/^Share a shopping list folder:\s*(.+?)\s*-\s*with:\s*(.+?)\s*-\s*permission:\s*(view|edit)$/i);
      if (match) {
        folderRoute = match[1].trim();
        recipient = match[2].trim();
        permission = (match[3].trim().toLowerCase() === 'edit' ? 'edit' : 'view') as 'view' | 'edit';
      } else {
        // Fallback: match without permission
        match = trimmed.match(/^Share a shopping list folder:\s*(.+?)\s*-\s*with:\s*(.+)$/i);
        if (match) {
          folderRoute = match[1].trim();
          recipient = match[2].trim();
          // Check if the recipient string or the whole message contains permission keywords
          const lowerRecipient = recipient.toLowerCase();
          const lowerTrimmed = trimmed.toLowerCase();
          if (lowerRecipient.includes('view permission') || lowerTrimmed.includes('permission: view') || lowerTrimmed.includes('view permission')) {
            permission = 'view';
          } else {
            // Default to edit if not specified
            permission = 'edit';
          }
        } else {
          missingFields.push('folder name or recipient');
        }
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
    } else if (trimmed.startsWith('List task folders:')) {
      action = 'list_folders';
      resourceType = 'folder';
      // Optional: can list all or specific parent folder's subfolders
      const match = trimmed.match(/^List task folders:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        folderRoute = undefined; // List all folders
      }
    } else if (trimmed.startsWith('Create a shopping list folder:')) {
      action = 'create';
      resourceType = 'folder';
      isShoppingListFolder = true;
      const match = trimmed.match(/^Create a shopping list folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Edit a shopping list folder:')) {
      action = 'edit';
      resourceType = 'folder';
      isShoppingListFolder = true;
      const match = trimmed.match(/^Edit a shopping list folder:\s*(.+?)\s*-\s*to:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
        newName = match[2].trim();
      } else {
        missingFields.push('folder name or new name');
      }
    } else if (trimmed.startsWith('Delete a shopping list folder:')) {
      action = 'delete';
      resourceType = 'folder';
      isShoppingListFolder = true;
      const match = trimmed.match(/^Delete a shopping list folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Create a shopping list sub-folder:')) {
      action = 'create_subfolder';
      resourceType = 'folder';
      isShoppingListFolder = true;
      const match = trimmed.match(/^Create a shopping list sub-folder:\s*(.+?)\s*-\s*name:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim(); // parent folder
        newName = match[2].trim(); // subfolder name
      } else {
        missingFields.push('parent folder or subfolder name');
      }
    } else if (trimmed.startsWith('List shopping list folders:')) {
      action = 'list_folders';
      resourceType = 'folder';
      isShoppingListFolder = true;
      // Optional: can list all or specific parent folder's subfolders
      const match = trimmed.match(/^List shopping list folders:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        folderRoute = undefined; // List all folders
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

    // Friend operations
    else if (trimmed.startsWith('Create a friend:')) {
      action = 'create';
      resourceType = 'friend';
      // Parse: "Create a friend: {name} - email: {email} - phone: {phone} - folder: {folder} - street: {street} - city: {city} - state: {state} - zip: {zip} - country: {country} - latitude: {lat} - longitude: {lng} - addressType: {type}"
      const match = trimmed.match(/^Create a friend:\s*(.+?)(?:\s*-\s*(.+))?$/i);
      if (match) {
        taskName = match[1].trim(); // friend name
        
        // Parse optional fields
        if (match[2]) {
          const fields = match[2].split(/\s*-\s*/);
          fields.forEach(field => {
            const [key, value] = field.split(':').map(s => s.trim());
            if (key && value) {
              const keyLower = key.toLowerCase();
              if (keyLower === 'email') {
                email = value;
              } else if (keyLower === 'phone') {
                phone = value;
              } else if (keyLower === 'folder') {
                folderRoute = value;
              } else if (keyLower === 'street') {
                street = value;
              } else if (keyLower === 'city') {
                city = value;
              } else if (keyLower === 'state') {
                state = value;
              } else if (keyLower === 'zip') {
                zip = value;
              } else if (keyLower === 'country') {
                country = value;
              } else if (keyLower === 'latitude') {
                latitude = parseFloat(value);
              } else if (keyLower === 'longitude') {
                longitude = parseFloat(value);
              } else if (keyLower === 'addresstype') {
                friendAddressType = value.toLowerCase() as 'home' | 'office' | 'parents_house';
              }
            }
          });
        }
      } else {
        missingFields.push('friend name');
      }
    } else if (trimmed.startsWith('Update a friend:')) {
      action = 'edit';
      resourceType = 'friend';
      const match = trimmed.match(/^Update a friend:\s*(.+?)\s*-\s*changes:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // existing friend name
        newName = match[2].trim(); // changes description
      } else {
        missingFields.push('friend name or changes');
      }
    } else if (trimmed.startsWith('Delete a friend:')) {
      action = 'delete';
      resourceType = 'friend';
      const match = trimmed.match(/^Delete a friend:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
      } else {
        missingFields.push('friend name');
      }
    } else if (trimmed.startsWith('List friends:')) {
      action = 'list';
      resourceType = 'friend';
      const match = trimmed.match(/^List friends:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        folderRoute = undefined; // List all friends
      }
    } else if (trimmed.startsWith('Create a friend folder:')) {
      action = 'create';
      resourceType = 'folder';
      isFriendFolder = true;
      const match = trimmed.match(/^Create a friend folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('Edit a friend folder:')) {
      action = 'edit';
      resourceType = 'folder';
      isFriendFolder = true;
      const match = trimmed.match(/^Edit a friend folder:\s*(.+?)\s*-\s*to:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
        newName = match[2].trim();
      } else {
        missingFields.push('folder name or new name');
      }
    } else if (trimmed.startsWith('Delete a friend folder:')) {
      action = 'delete';
      resourceType = 'folder';
      isFriendFolder = true;
      const match = trimmed.match(/^Delete a friend folder:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim();
      } else {
        missingFields.push('folder name');
      }
    } else if (trimmed.startsWith('List friend folders:')) {
      action = 'list_folders';
      resourceType = 'folder';
      isFriendFolder = true;
      const match = trimmed.match(/^List friend folders:\s*(.+)$/i);
      if (match) {
        const folderOrAll = match[1].trim();
        folderRoute = folderOrAll.toLowerCase() === 'all' ? undefined : folderOrAll;
      } else {
        folderRoute = undefined; // List all folders
      }
    }
    // Address operations
    else if (trimmed.startsWith('Create an address:')) {
      action = 'create';
      resourceType = 'address';
      // Parse: "Create an address: {name} - street: {street} - city: {city} ..."
      const nameMatch = trimmed.match(/^Create an address:\s*(.+?)(?:\s*-|$)/i);
      if (nameMatch) {
        taskName = nameMatch[1].trim();
        // Extract other fields if present
        const streetMatch = trimmed.match(/street:\s*([^-]+)/i);
        const cityMatch = trimmed.match(/city:\s*([^-]+)/i);
        const stateMatch = trimmed.match(/state:\s*([^-]+)/i);
        const zipMatch = trimmed.match(/zip:\s*([^-]+)/i);
        const countryMatch = trimmed.match(/country:\s*([^-]+)/i);
        const latMatch = trimmed.match(/latitude:\s*([^-]+)/i);
        const lngMatch = trimmed.match(/longitude:\s*([^-]+)/i);
        
        // Store additional fields in newName for now (we'll parse them in the method)
        const fields: string[] = [];
        if (streetMatch) fields.push(`street:${streetMatch[1].trim()}`);
        if (cityMatch) fields.push(`city:${cityMatch[1].trim()}`);
        if (stateMatch) fields.push(`state:${stateMatch[1].trim()}`);
        if (zipMatch) fields.push(`zip:${zipMatch[1].trim()}`);
        if (countryMatch) fields.push(`country:${countryMatch[1].trim()}`);
        if (latMatch) fields.push(`latitude:${latMatch[1].trim()}`);
        if (lngMatch) fields.push(`longitude:${lngMatch[1].trim()}`);
        
        newName = fields.join('|'); // Use | as separator
      } else {
        missingFields.push('address name');
      }
    } else if (trimmed.startsWith('Update an address:') || trimmed.startsWith('Edit an address:')) {
      action = 'edit';
      resourceType = 'address';
      const match = trimmed.match(/^(?:Update|Edit) an address:\s*(.+?)\s*-\s*changes:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
        newName = match[2].trim(); // Store changes in newName
      } else {
        missingFields.push('address name or changes');
      }
    } else if (trimmed.startsWith('Delete an address:')) {
      action = 'delete';
      resourceType = 'address';
      const match = trimmed.match(/^Delete an address:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim();
      } else {
        missingFields.push('address name');
      }
    } else if (trimmed.startsWith('List addresses:')) {
      action = 'list';
      resourceType = 'address';
      const match = trimmed.match(/^List addresses:\s*(.+)$/i);
      if (match) {
        listFilter = match[1].trim();
      } else {
        listFilter = 'all';
      }
    } else if (trimmed.startsWith('Get address:')) {
      action = 'get_address';
      resourceType = 'address';
      const match = trimmed.match(/^Get address:\s*(.+?)\s*-\s*type:\s*(.+)$/i);
      if (match) {
        taskName = match[1].trim(); // Using taskName as addressName for now
        status = match[2].trim().toLowerCase(); // Using status as addressType for now
      } else {
        // Try without type (default to location)
        const simpleMatch = trimmed.match(/^Get address:\s*(.+)$/i);
        if (simpleMatch) {
          taskName = simpleMatch[1].trim();
          status = 'location'; // Default to location (includes both address and pin)
        } else {
          missingFields.push('person/place name');
        }
      }
    }

    // Determine if this is a file folder operation
    const isFileFolder = trimmed.startsWith('Create a file folder:') ||
      trimmed.startsWith('Edit a file folder:') ||
      trimmed.startsWith('Delete a file folder:') ||
      trimmed.startsWith('Share a file folder:');

    // Update isShoppingListFolder if it wasn't already set in parsing
    if (isShoppingListFolder === undefined) {
      isShoppingListFolder = trimmed.startsWith('Create a shopping list folder:') ||
        trimmed.startsWith('Edit a shopping list folder:') ||
        trimmed.startsWith('Delete a shopping list folder:') ||
        trimmed.startsWith('Create a shopping list sub-folder:') ||
        trimmed.startsWith('List shopping list folders:');
      
      isFriendFolder = trimmed.startsWith('Create a friend folder:') ||
        trimmed.startsWith('Edit a friend folder:') ||
        trimmed.startsWith('Delete a friend folder:') ||
        trimmed.startsWith('List friend folders:');
    }

    return {
      action,
      resourceType,
      isShoppingListFolder,
      isFriendFolder,
      taskName,
      folderName,
      folderRoute,
      targetFolderRoute,
      recipient,
      newName,
      status,
      listFilter,
      typeFilter,
      missingFields,
      permission,
      addressName: taskName, // Map taskName to addressName for address operations
      addressType: status, // Map status to addressType for address operations
      email,
      phone,
      street,
      city,
      state,
      zip,
      country,
      latitude,
      longitude,
      friendAddressType,
      ...(isFileFolder ? { isFileFolder: true } : {}),
      ...(isShoppingListFolder ? { isShoppingListFolder: true } : {}),
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
            // Use the timezone passed from the caller (already fetched with calendar context)
            // Fallback to user timezone if not provided
            let userTimezone = timezone;
            if (!userTimezone) {
              const user = await getUserById(this.db, this.userId);
              userTimezone = (user as any)?.timezone;
            }
            return await this.listReminders(parsed, userTimezone);
          } else if (parsed.resourceType === 'event') {
            return await this.listEvents(parsed);
          } else if (parsed.resourceType === 'folder' && parsed.isShoppingListFolder) {
            return await this.listShoppingListFolders(parsed);
          } else if (parsed.resourceType === 'document') {
            return await this.listFiles(parsed);
          } else if (parsed.resourceType === 'address') {
            return await this.listAddresses(parsed);
          } else if (parsed.resourceType === 'friend') {
            return await this.listFriends(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to list.",
          };
        case 'get_address':
          return await this.getAddress(parsed);
        case 'create_shopping_item':
          return await this.createShoppingItem(parsed);
        case 'create':
          if (parsed.resourceType === 'task') {
            return await this.createTask(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.createReminder(parsed, timezone);
          } else if (parsed.resourceType === 'document') {
            return await this.createFile(parsed);
          } else if (parsed.resourceType === 'address') {
            return await this.createAddressAction(parsed);
          } else if (parsed.resourceType === 'friend') {
            return await this.createFriend(parsed);
          } else if (parsed.isShoppingListFolder) {
            return await this.createShoppingListFolder(parsed);
          } else if (parsed.isFriendFolder) {
            return await this.createFriendFolder(parsed);
          } else {
            return await this.createFolder(parsed);
          }
        case 'edit':
          if (parsed.resourceType === 'task') {
            // Check if this is a shopping list item edit
            const isShoppingListEdit = parsed.folderRoute?.toLowerCase().includes('shopping') || 
                                      parsed.folderRoute?.toLowerCase() === 'shopping list';
            if (isShoppingListEdit) {
              return await this.editShoppingItem(parsed);
            }
            return await this.editTask(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.updateReminder(parsed, timezone);
          } else if (parsed.resourceType === 'document') {
            return await this.editFile(parsed);
          } else if (parsed.resourceType === 'address') {
            return await this.updateAddressAction(parsed);
          } else if (parsed.resourceType === 'friend') {
            return await this.updateFriend(parsed);
          } else if (parsed.isShoppingListFolder) {
            return await this.editShoppingListFolder(parsed);
          } else if (parsed.isFriendFolder) {
            return await this.updateFriendFolder(parsed);
          } else {
            return await this.editFolder(parsed);
          }
        case 'delete':
          if (parsed.resourceType === 'task') {
            return await this.deleteTask(parsed);
          } else if (parsed.resourceType === 'note') {
            return await this.deleteNote(parsed);
          } else if (parsed.resourceType === 'reminder') {
            return await this.deleteReminder(parsed);
          } else if (parsed.resourceType === 'document') {
            return await this.deleteFile(parsed);
          } else if (parsed.resourceType === 'address') {
            return await this.deleteAddressAction(parsed);
          } else if (parsed.resourceType === 'friend') {
            return await this.deleteFriend(parsed);
          } else if (parsed.isShoppingListFolder) {
            return await this.deleteShoppingListFolder(parsed);
          } else if (parsed.isFriendFolder) {
            return await this.deleteFriendFolder(parsed);
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
          if (parsed.resourceType === 'document') {
            return await this.moveFile(parsed);
          }
          return await this.moveTask(parsed);
        case 'share':
          if (parsed.resourceType === 'task') {
            return await this.shareTask(parsed);
          } else if (parsed.resourceType === 'document') {
            return await this.shareFile(parsed);
          } else if (parsed.isShoppingListFolder) {
            return await this.shareShoppingListFolder(parsed);
          } else {
            return await this.shareFolder(parsed);
          }
        case 'view':
          if (parsed.resourceType === 'document') {
            return await this.viewFile(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to view.",
          };
        case 'create_subfolder':
          if (parsed.isShoppingListFolder) {
            return await this.createShoppingListSubfolder(parsed);
          }
          return await this.createSubfolder(parsed);
        case 'list_folders':
          if (parsed.isShoppingListFolder) {
            return await this.listShoppingListFolders(parsed);
          } else if (parsed.isFriendFolder) {
            return await this.listFriendFolders(parsed);
          } else if (parsed.resourceType === 'folder') {
            return await this.listTaskFolders(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what folders you want to list.",
          };
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

  private async editShoppingItem(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which item you'd like to edit. Please specify the item name.",
      };
    }

    if (!parsed.newName) {
      return {
        success: false,
        message: "I need to know what you'd like to change the item to. Please specify the new name.",
      };
    }

    try {
      // Find the item - search in specific folder if provided, otherwise search all
      let items = await getUserShoppingListItems(this.db, this.userId, {});
      
      if (parsed.folderRoute) {
        const folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
        if (folderId) {
          items = items.filter((item: any) => item.folderId === folderId);
        }
      }

      const item = items.find((i: any) => i.name.toLowerCase() === parsed.taskName!.toLowerCase());
      
      if (!item) {
        const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
        return {
          success: false,
          message: `I couldn't find the item "${parsed.taskName}"${folderText}. Please make sure the item exists.`,
        };
      }

      await updateShoppingListItem(this.db, item.id, this.userId, {
        name: parsed.newName,
      });

      return {
        success: true,
        message: `✏️ *Item Updated:*\n"${parsed.taskName}" → "${parsed.newName}"`,
      };
    } catch (error) {
      logger.error({ error, itemName: parsed.taskName, userId: this.userId }, 'Failed to edit shopping item');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the item "${parsed.taskName}". Please try again.`,
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
        message: `✅ *New Task Created:*\nTitle: ${parsed.taskName}`,
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

    try {
      // Resolve folder if specified
      let folderId: string | undefined = undefined;
      if (parsed.folderRoute) {
        folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute) || undefined;
        if (parsed.folderRoute && !folderId) {
          return {
            success: false,
            message: `I couldn't find the shopping lists folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }
      }

      await createShoppingListItem(this.db, {
        userId: this.userId,
        folderId,
        name: parsed.taskName,
        status: 'open',
      });

      const folderText = folderId && parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      return {
        success: true,
        message: `✓ Added "${parsed.taskName}" to Shopping Lists${folderText}`,
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

    // Check if folder already exists in file folders
    const existingFileFolder = (await getUserFileFolders(this.db, this.userId))
      .find(f => f.name.toLowerCase() === parsed.folderRoute.toLowerCase());
    
    if (existingFileFolder) {
      return {
        success: false,
        message: `A file folder named "${parsed.folderRoute}" already exists.`,
      };
    }

    // Check if it's a task folder
    const existingTaskFolder = (await getUserFolders(this.db, this.userId))
      .find(f => f.name.toLowerCase() === parsed.folderRoute.toLowerCase());
    
    if (existingTaskFolder) {
      return {
        success: false,
        message: `A folder named "${parsed.folderRoute}" already exists.`,
      };
    }

    // Check if this is a file folder operation (from isFileFolder flag or folder name)
    const folderNameLower = parsed.folderRoute.toLowerCase();
    const isFileFolderContext = parsed.isFileFolder || 
      folderNameLower.includes('file') || 
      folderNameLower.includes('document');
    
    if (isFileFolderContext) {
      try {
        const folder = await createUserFileFolder(this.db, {
          userId: this.userId,
          name: parsed.folderRoute,
        });

        return {
          success: true,
          message: `✅️ *New File Folder Created*\nName: ${parsed.folderRoute}`,
        };
      } catch (error) {
        logger.error({ error, folderName: parsed.folderRoute, userId: this.userId }, 'Failed to create file folder');
        return {
          success: false,
          message: `I'm sorry, I couldn't create the folder "${parsed.folderRoute}". Please try again.`,
        };
      }
    }

    // Default to task folder
    try {
      const folder = await createFolder(this.db, {
        userId: this.userId,
        name: parsed.folderRoute,
      });

      return {
        success: true,
        message: `✅ *New Task Folder Created:*\nName: ${parsed.folderRoute}`,
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

    // Check if it's a file folder first (using isFileFolder flag or by checking if folder exists)
    if (parsed.isFileFolder) {
      const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
      if (!fileFolderId) {
        return {
          success: false,
          message: `I couldn't find the file folder "${parsed.folderRoute}". Please make sure the folder exists.`,
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
        // Determine permission: use parsed permission if available, default to 'edit'
        const sharePermission = parsed.permission || 'edit';

        await createFileShare(this.db, {
          resourceType: 'file_folder',
          resourceId: fileFolderId,
          ownerId: this.userId,
          sharedWithUserId,
          permission: sharePermission,
        });

        const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
        return {
          success: true,
          message: `🔁 *File Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${parsed.recipient}\nAccount: ${parsed.recipient}\nPermission: ${permissionLabel}`,
        };
      } catch (error) {
        logger.error(
          { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
          'Failed to share file folder'
        );
        return {
          success: false,
          message: `I'm sorry, I couldn't share the folder "${parsed.folderRoute}" with ${parsed.recipient}. Please try again.`,
        };
      }
    }

    // Check if it's a file folder by name (for backward compatibility)
    const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
    if (fileFolderId) {
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
        // Determine permission: use parsed permission if available, default to 'edit'
        const sharePermission = parsed.permission || 'edit';

        await createFileShare(this.db, {
          resourceType: 'file_folder',
          resourceId: fileFolderId,
          ownerId: this.userId,
          sharedWithUserId,
          permission: sharePermission,
        });

        const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
        return {
          success: true,
          message: `🔁 *File Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${parsed.recipient}\nAccount: ${parsed.recipient}\nPermission: ${permissionLabel}`,
        };
      } catch (error) {
        logger.error(
          { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
          'Failed to share file folder'
        );
        return {
          success: false,
          message: `I'm sorry, I couldn't share the folder "${parsed.folderRoute}" with ${parsed.recipient}. Please try again.`,
        };
      }
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
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please provide the recipient's email address, phone number, or friend name (e.g., "john@example.com", "+27123456789", or "John Doe").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      await createTaskShare(this.db, {
        resourceType: 'task_folder',
        resourceId: folderId,
        ownerId: this.userId,
        sharedWithUserId,
        permission: sharePermission,
      });

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      return {
        success: true,
        message: `🔁 *Task Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${parsed.recipient}\nPermission: ${permissionLabel}`,
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

  private async shareShoppingListFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which shopping lists folder you'd like to share. Please specify the folder name.",
      };
    }

    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to share with. Please specify the recipient name.",
      };
    }

    const folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
    if (!folderId) {
      return {
        success: false,
        message: `I couldn't find the shopping lists folder "${parsed.folderRoute}". Please make sure the folder exists.`,
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
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please provide the recipient's email address, phone number, or friend name (e.g., "john@example.com", "+27123456789", or "John Doe").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      await createTaskShare(this.db, {
        resourceType: 'shopping_list_folder',
        resourceId: folderId,
        ownerId: this.userId,
        sharedWithUserId,
        permission: sharePermission,
      });

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      return {
        success: true,
        message: `🔁 *Shopping Lists Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${parsed.recipient}\nPermission: ${permissionLabel}`,
      };
    } catch (error) {
      logger.error(
        { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
        'Failed to share shopping list folder'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't share the shopping lists folder "${parsed.folderRoute}" with ${parsed.recipient}. Please try again.`,
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
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please provide the recipient's email address, phone number, or friend name (e.g., "john@example.com", "+27123456789", or "John Doe").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      await createTaskShare(this.db, {
        resourceType: 'task',
        resourceId: task.id,
        ownerId: this.userId,
        sharedWithUserId,
        permission: sharePermission,
      });

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      return {
        success: true,
        message: `🔁 *Task Shared*\nTitle: ${parsed.taskName}\nShare to: ${parsed.recipient}\nPermission: ${permissionLabel}`,
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
        message: `⚠️ *Task Updated:*\nNew Title: ${parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName}`,
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
    // Check if this is number-based deletion
    if (parsed.itemNumbers && parsed.itemNumbers.length > 0) {
      const context = this.getListContext();
      if (!context) {
        return {
          success: false,
          message: "I don't have a recent list to reference. Please list your items first, then delete by number.",
        };
      }

      // Check if this is shopping list deletion
      if (context.type === 'shopping') {
        const itemsToDelete = parsed.itemNumbers
          .map(num => context.items.find(item => item.number === num))
          .filter((item): item is { id: string, number: number, name?: string } => item !== undefined);

        if (itemsToDelete.length === 0) {
          return {
            success: false,
            message: `I couldn't find items with those numbers. Please check the numbers and try again.`,
          };
        }

        const deletedNames: string[] = [];
        const errors: string[] = [];

        for (const item of itemsToDelete) {
          try {
            await deleteShoppingListItem(this.db, item.id, this.userId);
            deletedNames.push(item.name || `Item ${item.number}`);
          } catch (error) {
            logger.error({ error, itemId: item.id, userId: this.userId }, 'Failed to delete shopping list item by number');
            errors.push(`Item ${item.number}`);
          }
        }

        if (deletedNames.length > 0) {
          this.clearListContext(); // Clear context after successful deletion
          return {
            success: true,
            message: `⛔ *Items Removed:*\n${deletedNames.join('\n')}${errors.length > 0 ? `\n\nFailed to delete: ${errors.join(', ')}` : ''}`,
          };
        } else {
          return {
            success: false,
            message: `I couldn't delete the items. Please try again.`,
          };
        }
      }

      // Handle regular task deletion by numbers
      if (context.type === 'tasks') {
        const tasksToDelete = parsed.itemNumbers
          .map(num => context.items.find(item => item.number === num))
          .filter((item): item is { id: string, number: number, name?: string } => item !== undefined);

        if (tasksToDelete.length === 0) {
          return {
            success: false,
            message: `I couldn't find tasks with those numbers. Please check the numbers and try again.`,
          };
        }

        const deletedNames: string[] = [];
        const errors: string[] = [];

        for (const task of tasksToDelete) {
          try {
            await deleteTask(this.db, task.id, this.userId);
            deletedNames.push(task.name || `Task ${task.number}`);
          } catch (error) {
            logger.error({ error, taskId: task.id, userId: this.userId }, 'Failed to delete task by number');
            errors.push(`Task ${task.number}`);
          }
        }

        if (deletedNames.length > 0) {
          this.clearListContext(); // Clear context after successful deletion
          return {
            success: true,
            message: `⛔ *Tasks Deleted:*\n${deletedNames.join('\n')}${errors.length > 0 ? `\n\nFailed to delete: ${errors.join(', ')}` : ''}`,
          };
        } else {
          return {
            success: false,
            message: `I couldn't delete the tasks. Please try again.`,
          };
        }
      }
    }

    // Fallback to name-based deletion
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to delete. Please specify the task name or number.",
      };
    }

    // Check if this is a shopping list operation
    const isShoppingList = parsed.folderRoute?.toLowerCase() === 'shopping list';
    
    if (isShoppingList) {
      // Handle shopping list item deletion
      const items = await getUserShoppingListItems(this.db, this.userId, {});
      const item = items.find((i) => i.name.toLowerCase() === parsed.taskName!.toLowerCase());
      
      if (!item) {
        return {
          success: false,
          message: `I couldn't find the item "${parsed.taskName}" in your shopping list. Please make sure the item exists.`,
        };
      }

      try {
        await deleteShoppingListItem(this.db, item.id, this.userId);
        return {
          success: true,
          message: `⛔ *Item Removed:*\n${item.name}`,
        };
      } catch (error) {
        logger.error({ error, itemId: item.id, userId: this.userId }, 'Failed to delete shopping list item');
        return {
          success: false,
          message: `I'm sorry, I couldn't delete the item "${parsed.taskName}". Please try again.`,
        };
      }
    }

    // Handle regular task deletion
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
        message: `⛔ *Task Deleted:*\nTitle: ${parsed.taskName}`,
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

    // Check if this is a shopping list operation
    const isShoppingList = parsed.folderRoute?.toLowerCase().includes('shopping') || 
                          parsed.folderRoute?.toLowerCase() === 'shopping list';
    
    if (isShoppingList) {
      // Handle shopping list item completion
      let items = await getUserShoppingListItems(this.db, this.userId, {});
      
      // Filter by folder if specified
      if (parsed.folderRoute && parsed.folderRoute.toLowerCase() !== 'shopping list') {
        const folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
        if (folderId) {
          items = items.filter((item: any) => item.folderId === folderId);
        }
      }

      const item = items.find((i) => i.name.toLowerCase() === parsed.taskName!.toLowerCase());
      
      if (!item) {
        const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
        return {
          success: false,
          message: `I couldn't find the item "${parsed.taskName}"${folderText}. Please make sure the item exists.`,
        };
      }

      try {
        await toggleShoppingListItemStatus(this.db, item.id, this.userId);
        const newStatus = item.status === 'open' ? 'completed' : 'open';
        return {
          success: true,
          message: newStatus === 'completed' 
            ? `✅ *Item Completed:*\n${item.name}`
            : `📝 *Item Reopened:*\n${item.name}`,
        };
      } catch (error) {
        logger.error({ error, itemId: item.id, userId: this.userId }, 'Failed to toggle shopping list item status');
        return {
          success: false,
          message: `I'm sorry, I couldn't update the item "${parsed.taskName}". Please try again.`,
        };
      }
    }

    // Handle regular task completion
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
        message: `✅ *Task Completed*\nTitle: ${parsed.taskName}`,
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
        message: `✅ *Task Moved Successfully*\n   "${parsed.taskName}"${sourceFolderText} to "${parsed.targetFolderRoute}"`,
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

    // Check if it's a file folder first (using isFileFolder flag or by checking if folder exists in file folders)
    if (parsed.isFileFolder) {
      const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
      if (!fileFolderId) {
        return {
          success: false,
          message: `I couldn't find the file folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }
      
      try {
        await updateUserFileFolder(this.db, fileFolderId, this.userId, {
          name: parsed.newName,
        });

        return {
          success: true,
          message: `✅ *File Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
        };
      } catch (error) {
        logger.error({ error, folderId: fileFolderId, userId: this.userId }, 'Failed to update file folder');
        return {
          success: false,
          message: `I'm sorry, I couldn't update the folder "${parsed.folderRoute}". Please try again.`,
        };
      }
    }

    // Check if it's a file folder by name (for backward compatibility)
    const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
    if (fileFolderId) {
      try {
        await updateUserFileFolder(this.db, fileFolderId, this.userId, {
          name: parsed.newName,
        });

        return {
          success: true,
          message: `✅ *File Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
        };
      } catch (error) {
        logger.error({ error, folderId: fileFolderId, userId: this.userId }, 'Failed to update file folder');
        return {
          success: false,
          message: `I'm sorry, I couldn't update the folder "${parsed.folderRoute}". Please try again.`,
        };
      }
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
        message: `✅ *Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
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

    // Check if it's a file folder first (using isFileFolder flag or by checking if folder exists)
    if (parsed.isFileFolder) {
      const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
      if (!fileFolderId) {
        return {
          success: false,
          message: `I couldn't find the file folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }
      
      try {
        await deleteUserFileFolder(this.db, fileFolderId, this.userId);
        return {
          success: true,
          message: `✅ *File Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
        };
      } catch (error) {
        logger.error({ error, folderId: fileFolderId, userId: this.userId }, 'Failed to delete file folder');
        return {
          success: false,
          message: `I'm sorry, I couldn't delete the folder "${parsed.folderRoute}". Please try again.`,
        };
      }
    }

    // Check if it's a file folder by name (for backward compatibility)
    const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
    if (fileFolderId) {
      try {
        await deleteUserFileFolder(this.db, fileFolderId, this.userId);
        return {
          success: true,
          message: `✅ *File Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
        };
      } catch (error) {
        logger.error({ error, folderId: fileFolderId, userId: this.userId }, 'Failed to delete file folder');
        return {
          success: false,
          message: `I'm sorry, I couldn't delete the folder "${parsed.folderRoute}". Please try again.`,
        };
      }
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
        message: `✅ *Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
      };
    } catch (error) {
      logger.error({ error, folderId, userId: this.userId }, 'Failed to delete folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  // ============================================
  // Document File Operations
  // ============================================

  private async createFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know what file you'd like to create. Please specify the file name.",
      };
    }

    const folderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    // Note: File creation via WhatsApp requires file upload, which isn't possible via text
    // This method creates a placeholder or informs the user they need to upload via web
    return {
      success: false,
      message: `To create a file "${parsed.taskName}", please upload it through the web interface. WhatsApp doesn't support file uploads via text messages.`,
    };
  }

  private async editFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName || !parsed.newName) {
      return {
        success: false,
        message: "I need to know which file to edit and what the new name should be. Please specify both.",
      };
    }

    const folderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    const file = await this.findFileByName(parsed.taskName, folderId);
    if (!file) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the file "${parsed.taskName}"${folderText}. Please make sure the file exists.`,
      };
    }

    try {
      await updateUserFile(this.db, file.id, this.userId, {
        title: parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName,
      });

      return {
        success: true,
        message: `✏️ *File updated:*\n"${parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName}"`,
      };
    } catch (error) {
      logger.error({ error, fileId: file.id, userId: this.userId }, 'Failed to update file');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the file "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async deleteFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which file you'd like to delete. Please specify the file name.",
      };
    }

    const folderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    const file = await this.findFileByName(parsed.taskName, folderId);
    if (!file) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the file "${parsed.taskName}"${folderText}. Please make sure the file exists.`,
      };
    }

    try {
      await deleteUserFile(this.db, file.id, this.userId);
      return {
        success: true,
        message: `⛔ *File Deleted:*\nFile: PDF\nName: ${parsed.taskName}`,
      };
    } catch (error) {
      logger.error({ error, fileId: file.id, userId: this.userId }, 'Failed to delete file');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the file "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async viewFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which file you'd like to view. Please specify the file name.",
      };
    }

    const folderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    const file = await this.findFileByName(parsed.taskName, folderId);
    if (!file) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the file "${parsed.taskName}"${folderText}. Please make sure the file exists.`,
      };
    }

    try {
      // Get signed URL for the file
      const key = file.cloudflareKey || this.extractKeyFromUrl(file.cloudflareUrl);
      let fileUrl = file.cloudflareUrl;
      
      if (key) {
        try {
          // Generate signed URL directly using S3 client
          fileUrl = await this.getSignedFileUrl(key);
        } catch (error) {
          logger.warn({ error, fileId: file.id, key }, 'Failed to get signed URL, using cloudflareUrl');
          // Fallback to cloudflareUrl if signed URL generation fails
        }
      }

      // Determine media type based on file type
      const isImage = file.fileType.startsWith('image/');
      const mediaType: 'image' | 'document' = isImage ? 'image' : 'document';
      
      // Send file via WhatsApp
      await this.whatsappService.sendMediaFile(
        this.recipient,
        fileUrl,
        mediaType,
        file.title, // Caption
        isImage ? undefined : file.fileName // Filename for documents only
      );

      const fileSizeMB = (file.fileSize / (1024 * 1024)).toFixed(2);
      
      return {
        success: true,
        message: `📄 *File sent:*\n"${file.title}" (${fileSizeMB} MB)`,
      };
    } catch (error) {
      logger.error({ error, fileId: file.id, userId: this.userId }, 'Failed to send file via WhatsApp');
      
      // Fallback to showing file details if sending fails
      const fileSizeMB = (file.fileSize / (1024 * 1024)).toFixed(2);
      const folderText = file.folderId ? ` in folder "${parsed.folderRoute || 'Unknown'}"` : ' (Uncategorized)';
      
      return {
        success: false,
        message: `📄 *File Details:*\n"${file.title}"\n\nType: ${file.fileType}\nSize: ${fileSizeMB} MB${folderText}\n\nI couldn't send the file via WhatsApp. Please open it in the web interface.`,
      };
    }
  }

  /**
   * Get signed URL for a file from Cloudflare R2
   */
  private async getSignedFileUrl(key: string): Promise<string> {
    const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
    const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
    const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
    const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "imaginecalendar";

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      throw new Error("Missing R2 credentials");
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    // Generate signed URL valid for 1 hour (enough time for WhatsApp to download)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return signedUrl;
  }

  /**
   * Extract key from Cloudflare URL
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      // Expect /bucket-or-path/<key>
      // e.g. https://xxx.r2.cloudflarestorage.com/users/... or https://pub-xxx.r2.dev/users/...
      return parsed.pathname.startsWith("/") ? parsed.pathname.slice(1) : parsed.pathname;
    } catch {
      return null;
    }
  }

  private async moveFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which file you'd like to move. Please specify the file name.",
      };
    }

    if (!parsed.targetFolderRoute) {
      return {
        success: false,
        message: "I need to know where you'd like to move the file. Please specify the target folder.",
      };
    }

    const sourceFolderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    const file = await this.findFileByName(parsed.taskName, sourceFolderId);
    if (!file) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the file "${parsed.taskName}"${folderText}. Please make sure the file exists.`,
      };
    }

    const targetFolderId = await this.resolveFileFolderRoute(parsed.targetFolderRoute);
    if (!targetFolderId) {
      return {
        success: false,
        message: `I couldn't find the target folder "${parsed.targetFolderRoute}". Please make sure the folder exists.`,
      };
    }

    try {
      await updateUserFile(this.db, file.id, this.userId, {
        folderId: targetFolderId,
      });

      return {
        success: true,
        message: `📁 *File moved:*\n"${parsed.taskName}" to "${parsed.targetFolderRoute}"`,
      };
    } catch (error) {
      logger.error({ error, fileId: file.id, userId: this.userId }, 'Failed to move file');
      return {
        success: false,
        message: `I'm sorry, I couldn't move the file "${parsed.taskName}". Please try again.`,
      };
    }
  }

  private async shareFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which file you'd like to share. Please specify the file name.",
      };
    }

    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to share with. Please specify the recipient.",
      };
    }

    const folderId = parsed.folderRoute 
      ? await this.resolveFileFolderRoute(parsed.folderRoute) 
      : null;

    const file = await this.findFileByName(parsed.taskName, folderId);
    if (!file) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the file "${parsed.taskName}"${folderText}. Please make sure the file exists.`,
      };
    }

    // Try to find user by email, phone, or friend name
    // The searchUsersForFileSharing function now includes friend name search
    const sharedWithUserId = await this.resolveRecipient(parsed.recipient);

    if (!sharedWithUserId) {
      // Check if recipient looks like email or phone for better error messages
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
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please provide the recipient's email address, phone number, or friend name (e.g., "john@example.com", "+27123456789", or "John Doe").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      await createFileShare(this.db, {
        resourceType: 'file',
        resourceId: file.id,
        ownerId: this.userId,
        sharedWithUserId,
        permission: sharePermission,
      });

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      return {
        success: true,
        message: `🔁 *File Shared*\nFile: ${parsed.taskName}\nShare to: ${parsed.recipient}\nPermission: ${permissionLabel}`,
      };
    } catch (error) {
      logger.error(
        { error, fileName: parsed.taskName, recipient: parsed.recipient, userId: this.userId },
        'Failed to share file'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't share the file "${parsed.taskName}" with ${parsed.recipient}. Please try again.`,
      };
    }
  }

  private async listFiles(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      // Handle "all" case - folderRoute will be undefined when user says "all"
      const folderRoute = parsed.folderRoute || parsed.listFilter;
      const isAll = !folderRoute || folderRoute.toLowerCase() === 'all';
      
      const folderId = !isAll && folderRoute
        ? await this.resolveFileFolderRoute(folderRoute) 
        : null;
      
      if (!isAll && folderRoute && !folderId) {
        return {
          success: false,
          message: `I couldn't find the folder "${folderRoute}". Please make sure the folder exists.`,
        };
      }

      const allFiles = await getUserFiles(this.db, this.userId);
      const files = folderId 
        ? allFiles.filter(f => f.folderId === folderId)
        : allFiles;

      if (files.length === 0) {
        const folderText = !isAll && folderRoute
          ? ` in the "${folderRoute}" folder` 
          : '';
        return {
          success: true,
          message: `📄 *You have no files${folderText}*`,
        };
      }

      const folderText = !isAll && folderRoute
        ? ` in "${folderRoute}"` 
        : '';
      
      let message = `🪪 *Show All Files*\n`;
      
      files.slice(0, 20).forEach((file, index) => {
        message += `*${index + 1}.* ${file.title}\n`;
      });

      if (files.length > 20) {
        message += `\n... and ${files.length - 20} more files.`;
      }

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, folderRoute: parsed.folderRoute }, 'Failed to list files');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your files. Please try again.",
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
      // Check if this is a Shopping Lists request
      // Shopping list can be detected by:
      // 1. Folder route contains "shopping" or is "shopping list"
      // 2. List filter contains "shopping"
      // 3. Folder route is undefined but user asked for shopping list (handled by AI prompt)
      const isShoppingList = parsed.folderRoute?.toLowerCase().includes('shopping') || 
                            parsed.folderRoute?.toLowerCase() === 'shopping list' ||
                            parsed.listFilter?.toLowerCase().includes('shopping');
      
      if (isShoppingList) {
        // Handle shopping list items
        const statusFilter = parsed.status && parsed.status !== 'all' ? parsed.status as 'open' | 'completed' : undefined;
        
        // Resolve folder if specified
        let folderId: string | undefined = undefined;
        if (parsed.folderRoute && parsed.folderRoute.toLowerCase() !== 'shopping list' && parsed.folderRoute.toLowerCase() !== 'all') {
          const resolvedFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
          folderId = resolvedFolderId || undefined;
          if (!folderId) {
            return {
              success: false,
              message: `I couldn't find the shopping lists folder "${parsed.folderRoute}". Please make sure the folder exists.`,
            };
          }
        }

        const items = await getUserShoppingListItems(this.db, this.userId, {
          folderId,
          status: statusFilter,
        });

        if (items.length === 0) {
          const statusText = statusFilter ? ` (${statusFilter})` : '';
          const folderText = folderId ? ` in "${parsed.folderRoute}"` : '';
          return {
            success: true,
            message: `🛒 *Your shopping list${folderText} is empty${statusText}*`,
          };
        }

        const statusText = statusFilter ? ` (${statusFilter})` : '';
        const folderText = folderId ? ` - ${parsed.folderRoute}` : '';
        let message = `🛍️ *Shopping Lists${folderText}${statusText}:*\n`;
        
        const displayedItems = items.slice(0, 20);
        displayedItems.forEach((item, index) => {
          const statusIcon = item.status === 'completed' ? '✅' : '⬜';
          message += `${statusIcon} *${index + 1}.* ${item.name}`;
          if (item.description) {
            message += ` - ${item.description}`;
          }
          message += '\n';
        });

        if (items.length > 20) {
          message += `\n... and ${items.length - 20} more items.`;
        }

        // Store list context for number-based deletion
        this.storeListContext('shopping', displayedItems.map((item, index) => ({
          id: item.id,
          number: index + 1,
          name: item.name,
        })), parsed.folderRoute);

        return {
          success: true,
          message: message.trim(),
        };
      }

      // Handle regular tasks
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
          message: `📋 *You have no tasks${folderText}${statusText}*`,
        };
      }

      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      const statusText = statusFilter ? ` (${statusFilter})` : '';
      
      let message = `📋 *Todays Tasks${statusText}:*\n`;
      
      const displayedTasks = tasks.slice(0, 20);
      displayedTasks.forEach((task, index) => {
        message += `*${index + 1}.* ${task.title}\n`;
      });

      if (tasks.length > 20) {
        message += `\n... and ${tasks.length - 20} more tasks.`;
      }

      // Store list context for number-based deletion
      this.storeListContext('tasks', displayedTasks.map((task, index) => ({
        id: task.id,
        number: index + 1,
        name: task.title,
      })), parsed.folderRoute);

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
      
      const displayedNotes = notes.slice(0, 20);
      displayedNotes.forEach((note, index) => {
        const contentPreview = note.content ? (note.content.length > 50 ? note.content.substring(0, 50) + '...' : note.content) : '(no content)';
        message += `*${index + 1}.* "${note.title}"\n   ${contentPreview}\n\n`;
      });

      if (notes.length > 20) {
        message += `\n... and ${notes.length - 20} more notes.`;
      }

      // Store list context for number-based deletion
      this.storeListContext('notes', displayedNotes.map((note, index) => ({
        id: note.id,
        number: index + 1,
        name: note.title,
      })), parsed.folderRoute);

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

  private async deleteNote(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    // Check if this is number-based deletion
    if (parsed.itemNumbers && parsed.itemNumbers.length > 0) {
      const context = this.getListContext();
      if (!context || context.type !== 'notes') {
        return {
          success: false,
          message: "I don't have a recent notes list to reference. Please list your notes first, then delete by number.",
        };
      }

      const notesToDelete = parsed.itemNumbers
        .map(num => context.items.find(item => item.number === num))
        .filter((item): item is { id: string, number: number, name?: string } => item !== undefined);

      if (notesToDelete.length === 0) {
        return {
          success: false,
          message: `I couldn't find notes with those numbers. Please check the numbers and try again.`,
        };
      }

      const deletedNames: string[] = [];
      const errors: string[] = [];

      for (const note of notesToDelete) {
        try {
          await deleteNote(this.db, note.id, this.userId);
          deletedNames.push(note.name || `Note ${note.number}`);
        } catch (error) {
          logger.error({ error, noteId: note.id, userId: this.userId }, 'Failed to delete note by number');
          errors.push(`Note ${note.number}`);
        }
      }

      if (deletedNames.length > 0) {
        this.clearListContext(); // Clear context after successful deletion
        return {
          success: true,
          message: `⛔ *Notes Deleted:*\n${deletedNames.join('\n')}${errors.length > 0 ? `\n\nFailed to delete: ${errors.join(', ')}` : ''}`,
        };
      } else {
        return {
          success: false,
          message: `I couldn't delete the notes. Please try again.`,
        };
      }
    }

    // Fallback to name-based deletion
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which note you'd like to delete. Please specify the note title or number.",
      };
    }

    const folderId = parsed.folderRoute ? await this.resolveFolderRoute(parsed.folderRoute) : undefined;
    const notes = await getUserNotes(this.db, this.userId, { folderId });
    const note = notes.find((n) => n.title.toLowerCase() === parsed.taskName!.toLowerCase());

    if (!note) {
      const folderText = parsed.folderRoute ? ` in the "${parsed.folderRoute}" folder` : '';
      return {
        success: false,
        message: `I couldn't find the note "${parsed.taskName}"${folderText}. Please make sure the note exists.`,
      };
    }

    try {
      await deleteNote(this.db, note.id, this.userId);
      return {
        success: true,
        message: `⛔ *Note Deleted:*\n${note.title}`,
      };
    } catch (error) {
      logger.error({ error, noteId: note.id, userId: this.userId }, 'Failed to delete note');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the note "${parsed.taskName}". Please try again.`,
      };
    }
  }

  /**
   * Check if a reminder can occur on a specific date based on its frequency pattern
   * This matches the logic from the reminders page
   */
  private canReminderOccurOnDate(
    reminder: any,
    checkDate: Date,
    timezone?: string
  ): boolean {
    // Get the date components in the user's timezone
    let dateInTz: Date;
    if (timezone) {
      const dateStr = checkDate.toLocaleString("en-US", { timeZone: timezone });
      dateInTz = new Date(dateStr);
    } else {
      dateInTz = new Date(checkDate);
    }
    
    const year = dateInTz.getFullYear();
    const month = dateInTz.getMonth() + 1; // 1-12
    const day = dateInTz.getDate();
    const dayOfWeek = dateInTz.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    
    switch (reminder.frequency) {
      case "daily":
      case "hourly":
      case "minutely":
        // These can occur on any date
        return true;
        
      case "once":
        // Check if the date matches the target date or daysFromNow calculation
        if (reminder.targetDate) {
          const target = new Date(reminder.targetDate);
          let targetInTz: Date;
          if (timezone) {
            const targetStr = target.toLocaleString("en-US", { timeZone: timezone });
            targetInTz = new Date(targetStr);
          } else {
            targetInTz = new Date(target);
          }
          return (
            targetInTz.getFullYear() === year &&
            targetInTz.getMonth() + 1 === month &&
            targetInTz.getDate() === day
          );
        }
        if (reminder.daysFromNow !== null && reminder.daysFromNow !== undefined) {
          // Calculate the target date from daysFromNow
          const now = new Date();
          let nowInTz: Date;
          if (timezone) {
            const nowStr = now.toLocaleString("en-US", { timeZone: timezone });
            nowInTz = new Date(nowStr);
          } else {
            nowInTz = new Date(now);
          }
          const targetDate = new Date(nowInTz);
          targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
          return (
            targetDate.getFullYear() === year &&
            targetDate.getMonth() + 1 === month &&
            targetDate.getDate() === day
          );
        }
        return false;
        
      case "weekly":
        // Check if the day of week matches
        if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
          return false;
        }
        return reminder.daysOfWeek.includes(dayOfWeek);
        
      case "monthly":
        // Check if the day of month matches
        const reminderDay = reminder.dayOfMonth ?? 1;
        // Handle edge case where day doesn't exist in month (e.g., Feb 31)
        const lastDayOfMonth = new Date(year, month, 0).getDate();
        const targetDay = Math.min(reminderDay, lastDayOfMonth);
        return day === targetDay;
        
      case "yearly":
        // Check if the month and day match
        const reminderMonth = reminder.month ?? 1;
        const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
        // Handle edge case where day doesn't exist in month (e.g., Feb 31)
        const lastDay = new Date(year, month, 0).getDate();
        const targetDayOfMonth = Math.min(reminderDayOfMonth, lastDay);
        return month === reminderMonth && day === targetDayOfMonth;
        
      default:
        return false;
    }
  }

  /**
   * Check if a reminder can occur on any date within a date range
   * This matches the logic from the reminders page
   */
  private canReminderOccurInRange(
    reminder: any,
    startDate: Date,
    endDate: Date,
    timezone?: string
  ): boolean {
    // Get date components for start and end dates in user's timezone
    let startInTz: Date;
    let endInTz: Date;
    if (timezone) {
      const startStr = startDate.toLocaleString("en-US", { timeZone: timezone });
      const endStr = endDate.toLocaleString("en-US", { timeZone: timezone });
      startInTz = new Date(startStr);
      endInTz = new Date(endStr);
    } else {
      startInTz = new Date(startDate);
      endInTz = new Date(endDate);
    }
    
    const startYear = startInTz.getFullYear();
    const startMonth = startInTz.getMonth() + 1;
    const startDay = startInTz.getDate();
    const endYear = endInTz.getFullYear();
    const endMonth = endInTz.getMonth() + 1;
    const endDay = endInTz.getDate();
    
    switch (reminder.frequency) {
      case "daily":
      case "hourly":
      case "minutely":
        // These can occur on any date
        return true;
        
      case "once":
        // Check if the target date is within the range
        if (reminder.targetDate) {
          const target = new Date(reminder.targetDate);
          let targetInTz: Date;
          if (timezone) {
            const targetStr = target.toLocaleString("en-US", { timeZone: timezone });
            targetInTz = new Date(targetStr);
          } else {
            targetInTz = new Date(target);
          }
          const targetYear = targetInTz.getFullYear();
          const targetMonth = targetInTz.getMonth() + 1;
          const targetDay = targetInTz.getDate();
          
          // Check if target date is within range
          if (targetYear < startYear || targetYear > endYear) return false;
          if (targetYear === startYear && targetMonth < startMonth) return false;
          if (targetYear === startYear && targetMonth === startMonth && targetDay < startDay) return false;
          if (targetYear === endYear && targetMonth > endMonth) return false;
          if (targetYear === endYear && targetMonth === endMonth && targetDay > endDay) return false;
          return true;
        }
        if (reminder.daysFromNow !== null && reminder.daysFromNow !== undefined) {
          // Calculate the target date from daysFromNow
          // Note: This uses current date, matching the reminders page logic
          const now = new Date();
          let nowInTz: Date;
          if (timezone) {
            const nowStr = now.toLocaleString("en-US", { timeZone: timezone });
            nowInTz = new Date(nowStr);
          } else {
            nowInTz = new Date(now);
          }
          const targetDate = new Date(nowInTz);
          targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
          targetDate.setHours(0, 0, 0, 0); // Reset to start of day for comparison
          
          // Check if target date is within range
          const startOfDay = new Date(startInTz);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(endInTz);
          endOfDay.setHours(23, 59, 59, 999);
          
          return targetDate >= startOfDay && targetDate <= endOfDay;
        }
        return false;
        
      case "weekly":
        // Check if any day of week in the range matches
        if (!reminder.daysOfWeek || reminder.daysOfWeek.length === 0) {
          return false;
        }
        // Iterate through days in range and check if any matches
        const currentDate = new Date(startInTz);
        while (currentDate <= endInTz) {
          const dayOfWeek = currentDate.getDay();
          if (reminder.daysOfWeek.includes(dayOfWeek)) {
            return true;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        return false;
        
      case "monthly":
        // Check if any date in the range matches the day of month
        const reminderDay = reminder.dayOfMonth ?? 1;
        const currentMonthDate = new Date(startInTz);
        while (currentMonthDate <= endInTz) {
          const year = currentMonthDate.getFullYear();
          const month = currentMonthDate.getMonth() + 1;
          const lastDayOfMonth = new Date(year, month, 0).getDate();
          const targetDay = Math.min(reminderDay, lastDayOfMonth);
          
          // Check if this month's target day is in range
          const targetDate = new Date(year, month - 1, targetDay);
          if (targetDate >= startInTz && targetDate <= endInTz) {
            return true;
          }
          // Move to next month
          currentMonthDate.setMonth(currentMonthDate.getMonth() + 1);
          currentMonthDate.setDate(1);
        }
        return false;
        
      case "yearly":
        // Check if any date in the range matches the month and day
        const reminderMonth = reminder.month ?? 1;
        const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
        
        // Check each year in the range
        for (let year = startYear; year <= endYear; year++) {
          const lastDay = new Date(year, reminderMonth, 0).getDate();
          const targetDay = Math.min(reminderDayOfMonth, lastDay);
          const targetDate = new Date(year, reminderMonth - 1, targetDay);
          
          if (targetDate >= startInTz && targetDate <= endInTz) {
            return true;
          }
        }
        return false;
        
      default:
        return false;
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
      
      // Filter by reminder type if specified
      if (parsed.typeFilter) {
        filteredReminders = filteredReminders.filter(r => r.frequency === parsed.typeFilter);
      }

      // Filter by time if specified (today, tomorrow, this week, this month)
      // Calculate date ranges based on user's timezone (not server timezone)
      if (parsed.listFilter && userTimezone) {
        const timeFilter = parsed.listFilter.toLowerCase().trim();
        
        // Get current date/time in user's timezone
        const now = new Date();
        const userNowString = now.toLocaleString("en-US", { timeZone: userTimezone });
        const userNow = new Date(userNowString);
        
        // Log user timezone calculation for debugging
        logger.debug({
          userId: this.userId,
          serverTime: now.toISOString(),
          userTimezone,
          userNowString,
          userNowISO: userNow.toISOString(),
          userNowLocal: userNow.toLocaleString("en-US", { timeZone: userTimezone }),
        }, 'Calculated user time for date filtering');
        
        // Calculate date filter range based on filter type using user's timezone
        let dateFilterRange: { start: Date; end: Date } | null = null;
        
        if (timeFilter === 'today' || timeFilter.includes('today')) {
          dateFilterRange = {
            start: startOfDay(userNow),
            end: endOfDay(userNow),
          };
        } else if (timeFilter === 'tomorrow' || timeFilter.includes('tomorrow')) {
          const tomorrow = addDays(userNow, 1);
          dateFilterRange = {
            start: startOfDay(tomorrow),
            end: endOfDay(tomorrow),
          };
        } else if (timeFilter.includes('this week') || timeFilter.includes('week')) {
          dateFilterRange = {
            start: startOfWeek(userNow, { weekStartsOn: 0 }), // Sunday
            end: endOfWeek(userNow, { weekStartsOn: 0 }),
          };
        } else if (timeFilter.includes('this month') || timeFilter.includes('month')) {
          dateFilterRange = {
            start: startOfMonth(userNow),
            end: endOfMonth(userNow),
          };
        } else if (timeFilter.includes('next week')) {
          const nextWeekStart = addDays(startOfWeek(userNow, { weekStartsOn: 0 }), 7);
          dateFilterRange = {
            start: startOfDay(nextWeekStart),
            end: endOfDay(endOfWeek(nextWeekStart, { weekStartsOn: 0 })),
          };
        }

        // Log for debugging
        logger.info({
          userId: this.userId,
          timeFilter,
          parsedListFilter: parsed.listFilter,
          userTimezone,
          dateFilterRange: dateFilterRange ? {
            start: dateFilterRange.start.toISOString(),
            end: dateFilterRange.end.toISOString(),
          } : null,
          reminderCountBeforeFilter: filteredReminders.length,
        }, 'Filtering reminders by time');

        if (dateFilterRange) {
          // Use the same filtering logic as reminders page
          filteredReminders = filteredReminders.filter(reminder => {
            // Prepare reminder object for checking (same structure as reminders page)
            const reminderForCheck: any = {
              ...reminder,
              time: reminder.time ?? null,
              minuteOfHour: reminder.minuteOfHour ?? null,
              intervalMinutes: reminder.intervalMinutes ?? null,
              daysFromNow: reminder.daysFromNow ?? null,
              targetDate: reminder.targetDate ? (reminder.targetDate instanceof Date ? reminder.targetDate : new Date(reminder.targetDate)) : null,
              dayOfMonth: reminder.dayOfMonth ?? null,
              month: reminder.month ?? null,
              daysOfWeek: reminder.daysOfWeek ?? null,
            };
            
            // Check if the reminder can occur on any date within the range
            const canOccur = this.canReminderOccurInRange(
              reminderForCheck,
              dateFilterRange!.start,
              dateFilterRange!.end,
              userTimezone
            );
            
            // Log for debugging
            if (!canOccur) {
              logger.debug({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                active: reminder.active,
                dateRange: {
                  start: dateFilterRange!.start.toISOString(),
                  end: dateFilterRange!.end.toISOString(),
                },
                reason: 'Reminder cannot occur in date range',
              }, 'Reminder filtered out by date range');
            }
            
            return canOccur;
          });
          
          // Log final filtered count
          logger.info({
            userId: this.userId,
            timeFilter: parsed.listFilter,
            reminderCountBeforeTimeFilter: reminders.length,
            reminderCountAfterTimeFilter: filteredReminders.length,
            filteredReminderIds: filteredReminders.map(r => ({
              id: r.id,
              title: r.title,
              frequency: r.frequency,
              active: r.active,
            })),
          }, 'Time filtering completed');
        } else {
          // Unknown filter - log warning
          logger.warn({ timeFilter, userId: this.userId }, 'Unknown time filter, showing all reminders');
        }
      } else if (parsed.listFilter) {
        // listFilter is set but no timezone - log warning
        logger.warn({
          userId: this.userId,
          listFilter: parsed.listFilter,
          hasTimezone: !!userTimezone,
        }, 'listFilter specified but no user timezone available - cannot filter by time');
      }

      // Log filtered results
      logger.info({
        userId: this.userId,
        timeFilter: parsed.listFilter,
        reminderCountAfterFilter: filteredReminders.length,
        reminderCountBeforeFilter: reminders.length,
      }, 'Reminder filtering complete');

      if (filteredReminders.length === 0) {
        // Format filter name for title
        let filterTitle = 'Reminders';
        if (parsed.listFilter) {
          const filter = parsed.listFilter.toLowerCase();
          if (filter === 'today') filterTitle = "Todays Reminders";
          else if (filter === 'tomorrow') filterTitle = "Tomorrows Reminders";
          else if (filter.includes('week')) filterTitle = "This Weeks Reminders";
          else if (filter.includes('month')) filterTitle = "This Months Reminders";
          else filterTitle = `Reminders for ${parsed.listFilter}`;
        }
        return {
          success: true,
          message: `🔔 *${filterTitle}*\n\nNone`,
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

      // Format filter name for title
      let filterTitle = 'Reminders';
      if (parsed.listFilter) {
        const filter = parsed.listFilter.toLowerCase();
        if (filter === 'today') filterTitle = "Today's Reminders";
        else if (filter === 'tomorrow') filterTitle = "Tomorrow's Reminders";
        else if (filter.includes('week')) filterTitle = "This Week's Reminders";
        else if (filter.includes('month')) filterTitle = "This Month's Reminders";
        else filterTitle = `Reminders for ${parsed.listFilter}`;
      }
      
      // Message header is bold - only header and list numbers are bold
      let message = `🔔 *${filterTitle}*\n`;
      
      remindersWithNextTime.slice(0, 20).forEach(({ reminder, nextTime }, index) => {
        // Format next time in user's timezone
        let timeDisplay = '';
        if (nextTime && nextTime.getTime() > 0 && userTimezone) {
          const nextTimeInUserTz = new Date(nextTime.toLocaleString("en-US", { timeZone: userTimezone }));
          const hours = nextTimeInUserTz.getHours();
          const minutes = nextTimeInUserTz.getMinutes();
          // Use 24-hour format for professional look
          timeDisplay = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        
        // Format: number. Title | Time (only list numbers are bold, not titles)
        if (timeDisplay) {
          message += `*${index + 1}.* ${reminder.title} | ${timeDisplay}\n`;
        } else {
          message += `*${index + 1}.* ${reminder.title}\n`;
        }
      });

      if (remindersWithNextTime.length > 20) {
        message += `... and ${remindersWithNextTime.length - 20} more reminders.`;
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
      // For one-time reminders, check directly if they're scheduled for today
      if (reminder.frequency === 'once') {
        return this.isOnceReminderScheduledForToday(reminder, userLocalTime, userTimezone);
      }

      // For recurring reminders, calculate the actual next occurrence time
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

      // Check if the next occurrence is today - strict date comparison
      const isToday = nextYear === userLocalTime.year &&
                      nextMonth === userLocalTime.month &&
                      nextDay === userLocalTime.day;

      // Log detailed comparison for debugging
      logger.debug({
        reminderId: reminder.id,
        reminderTitle: reminder.title,
        frequency: reminder.frequency,
        nextYear,
        nextMonth: nextMonth + 1,
        nextDay,
        userYear: userLocalTime.year,
        userMonth: userLocalTime.month + 1,
        userDay: userLocalTime.day,
        isToday,
        nextTimeISO: nextTime.toISOString(),
      }, 'Date comparison for reminder');

      return isToday;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if reminder is scheduled for date');
      return false;
    }
  }

  /**
   * Check if a one-time reminder is scheduled for today
   */
  private isOnceReminderScheduledForToday(
    reminder: any,
    userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
    userTimezone: string
  ): boolean {
    try {
      // Skip inactive reminders
      if (!reminder.active) {
        return false;
      }

      let targetYear: number;
      let targetMonth: number; // 0-11
      let targetDay: number;
      
      if (reminder.targetDate) {
        // Get target date components in user's timezone
        const targetDateFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        });
        
        const targetParts = targetDateFormatter.formatToParts(new Date(reminder.targetDate));
        const getPart = (type: string) => targetParts.find(p => p.type === type)?.value || '0';
        
        targetYear = parseInt(getPart('year'), 10);
        targetMonth = parseInt(getPart('month'), 10) - 1; // Convert to 0-11
        targetDay = parseInt(getPart('day'), 10);
      } else if (reminder.daysFromNow !== undefined) {
        // Calculate target date from daysFromNow using reminder's creation date
        const reminderCreatedAt = (reminder as any).createdAt ? new Date((reminder as any).createdAt) : userLocalTime.date;
        
        // Get creation date components in user's timezone
        const createdFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: userTimezone,
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour12: false,
        });
        
        const createdParts = createdFormatter.formatToParts(reminderCreatedAt);
        const getCreatedPart = (type: string) => createdParts.find(p => p.type === type)?.value || '0';
        
        const createdYear = parseInt(getCreatedPart('year'), 10);
        const createdMonth = parseInt(getCreatedPart('month'), 10) - 1; // Convert to 0-11
        const createdDay = parseInt(getCreatedPart('day'), 10);
        
        // Calculate target date by adding daysFromNow to creation date
        const targetDateObj = new Date(Date.UTC(createdYear, createdMonth, createdDay + reminder.daysFromNow));
        targetYear = targetDateObj.getUTCFullYear();
        targetMonth = targetDateObj.getUTCMonth();
        targetDay = targetDateObj.getUTCDate();
      } else if (reminder.dayOfMonth && reminder.month) {
        // Specific date (month + dayOfMonth)
        targetYear = userLocalTime.year;
        targetMonth = reminder.month - 1; // Convert 1-12 to 0-11
        targetDay = reminder.dayOfMonth;
        
        // Check if this year's date has already passed
        const thisYearDate = this.createDateInUserTimezone(targetYear, targetMonth, targetDay, 9, 0, userTimezone);
        if (thisYearDate < userLocalTime.date) {
          targetYear += 1;
        }
      } else {
        return false;
      }
      
      // Check if today's date matches the target date (in user's timezone)
      // Strict date comparison - must match exactly
      const dateMatches = targetYear === userLocalTime.year && 
                          targetMonth === userLocalTime.month && 
                          targetDay === userLocalTime.day;
      
      // Log detailed comparison for debugging
      logger.debug({
        reminderId: reminder.id,
        reminderTitle: reminder.title,
        targetYear,
        targetMonth: targetMonth + 1,
        targetDay,
        userYear: userLocalTime.year,
        userMonth: userLocalTime.month + 1,
        userDay: userLocalTime.day,
        dateMatches,
        hasTargetDate: !!reminder.targetDate,
        targetDate: reminder.targetDate ? new Date(reminder.targetDate).toISOString() : null,
        daysFromNow: reminder.daysFromNow,
      }, 'One-time reminder date comparison');
      
      // Return true only if dates match exactly
      // For "today" filter, show all reminders scheduled for today, even if time has passed
      return dateMatches;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if one-time reminder is scheduled for today');
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
        // Use a more precise comparison - check if time has passed (with 1 minute tolerance)
        const currentTimeMs = userLocalTime.date.getTime();
        const reminderTimeMs = todayReminder.getTime();
        const oneMinuteMs = 60 * 1000;
        
        if (reminderTimeMs <= currentTimeMs + oneMinuteMs) {
          // Time has passed (or will pass within 1 minute), use tomorrow
          const tomorrowDate = new Date(Date.UTC(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1));
          return this.createDateInUserTimezone(tomorrowDate.getUTCFullYear(), tomorrowDate.getUTCMonth(), tomorrowDate.getUTCDate(), hours, minutes, userTimezone);
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
      } else if (reminder.frequency === 'hourly' && reminder.minuteOfHour !== undefined && reminder.minuteOfHour !== null) {
        let targetYear = userLocalTime.year;
        let targetMonth = userLocalTime.month;
        let targetDay = userLocalTime.day;
        let targetHour = userLocalTime.hours;
        const targetMinute = reminder.minuteOfHour;
        
        // Check if this hour's minute has passed
        if (userLocalTime.minutes >= targetMinute) {
          // Move to next hour
          targetHour += 1;
          if (targetHour >= 24) {
            targetHour = 0;
            targetDay += 1;
            // Handle day overflow
            const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
            if (targetDay > daysInMonth) {
              targetDay = 1;
              targetMonth += 1;
              if (targetMonth > 11) {
                targetMonth = 0;
                targetYear += 1;
              }
            }
          }
        }
        
        return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, targetHour, targetMinute, userTimezone);
      } else if (reminder.frequency === 'minutely' && reminder.intervalMinutes !== undefined && reminder.intervalMinutes !== null) {
        const interval = reminder.intervalMinutes;
        const currentMinutes = userLocalTime.hours * 60 + userLocalTime.minutes;
        const nextMinutes = currentMinutes + interval;
        
        let targetYear = userLocalTime.year;
        let targetMonth = userLocalTime.month;
        let targetDay = userLocalTime.day;
        let targetHour = Math.floor(nextMinutes / 60);
        const targetMinute = nextMinutes % 60;
        
        // Handle hour/day overflow
        if (targetHour >= 24) {
          targetHour = targetHour % 24;
          targetDay += 1;
          const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
          if (targetDay > daysInMonth) {
            targetDay = 1;
            targetMonth += 1;
            if (targetMonth > 11) {
              targetMonth = 0;
              targetYear += 1;
            }
          }
        }
        
        return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, targetHour, targetMinute, userTimezone);
      } else if (reminder.frequency === 'once') {
        if (reminder.targetDate) {
          // Get target date components in user's timezone
          const targetDateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false,
          });
          
          const targetParts = targetDateFormatter.formatToParts(new Date(reminder.targetDate));
          const getPart = (type: string) => targetParts.find(p => p.type === type)?.value || '0';
          
          const targetYear = parseInt(getPart('year'), 10);
          const targetMonth = parseInt(getPart('month'), 10) - 1; // Convert to 0-11
          const targetDay = parseInt(getPart('day'), 10);
          
          // Use reminder.time if specified, otherwise use time from targetDate
          let hours: number;
          let minutes: number;
          if (reminder.time) {
            const timeParts = reminder.time.split(':');
            hours = timeParts[0] ? parseInt(timeParts[0], 10) : 0;
            minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
          } else {
            hours = parseInt(getPart('hour'), 10);
            minutes = parseInt(getPart('minute'), 10);
          }
          
          return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
        } else if (reminder.daysFromNow !== undefined) {
          // Calculate target date from daysFromNow using reminder's creation date
          const reminderCreatedAt = (reminder as any).createdAt ? new Date((reminder as any).createdAt) : userLocalTime.date;
          
          // Get creation date components in user's timezone
          const createdFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour12: false,
          });
          
          const createdParts = createdFormatter.formatToParts(reminderCreatedAt);
          const getCreatedPart = (type: string) => createdParts.find(p => p.type === type)?.value || '0';
          
          const createdYear = parseInt(getCreatedPart('year'), 10);
          const createdMonth = parseInt(getCreatedPart('month'), 10) - 1; // Convert to 0-11
          const createdDay = parseInt(getCreatedPart('day'), 10);
          
          // Calculate target date by adding daysFromNow to creation date
          const targetDateObj = new Date(Date.UTC(createdYear, createdMonth, createdDay + reminder.daysFromNow));
          const targetYear = targetDateObj.getUTCFullYear();
          const targetMonth = targetDateObj.getUTCMonth();
          const targetDay = targetDateObj.getUTCDate();
          
          // Use reminder.time if specified, otherwise default to 9:00 AM
          const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
          return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
        } else if (reminder.dayOfMonth && reminder.month) {
          // Specific date (month + dayOfMonth)
          let targetYear = userLocalTime.year;
          const targetMonth = reminder.month - 1; // Convert 1-12 to 0-11
          const targetDay = reminder.dayOfMonth;
          
          // Check if this year's date has already passed
          const [hours, minutes] = (reminder.time || '09:00').split(':').map(Number);
          const thisYearDate = this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
          if (thisYearDate < userLocalTime.date) {
            targetYear += 1;
          }
          
          return this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
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

      // Calculate next occurrence date for the reminder
      let dateInfo = '';
      if (timezone) {
        const timeComponents = this.getCurrentTimeInTimezone(timezone);
        const now = new Date();
        const userNowString = now.toLocaleString("en-US", { timeZone: timezone });
        const userNow = new Date(userNowString);
        const userLocalTime = {
          year: timeComponents.year,
          month: timeComponents.month,
          day: timeComponents.day,
          hours: timeComponents.hour,
          minutes: timeComponents.minute,
          seconds: timeComponents.second,
          date: userNow,
        };
        const nextOccurrence = this.calculateNextReminderTime(reminder, userLocalTime, timezone);
        
        if (nextOccurrence) {
          // Format the next occurrence date
          const nextOccurrenceInUserTz = new Date(nextOccurrence.toLocaleString("en-US", { timeZone: timezone }));
          const hours = nextOccurrenceInUserTz.getHours();
          const minutes = nextOccurrenceInUserTz.getMinutes();
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Determine if it's today, tomorrow, or a specific date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const nextDateOnly = new Date(nextOccurrenceInUserTz);
          nextDateOnly.setHours(0, 0, 0, 0);
          
          let dateLabel = 'Today';
          if (nextDateOnly.getTime() === today.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateOnly.getTime() === tomorrow.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const day = nextOccurrenceInUserTz.getDate();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[nextOccurrenceInUserTz.getMonth()];
            dateLabel = `${day} ${month}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
        }
      }
      
      // Message header is bold - reminder title is NOT bold
      const responseMessage = `✅ *New Reminder Created:*\nTitle: ${reminder.title}\n${dateInfo ? `Date: ${dateInfo}` : ''}`;

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

      // Calculate next occurrence date for the updated reminder
      let dateInfo = '';
      if (timezone) {
        const timeComponents = this.getCurrentTimeInTimezone(timezone);
        const now = new Date();
        const userNowString = now.toLocaleString("en-US", { timeZone: timezone });
        const userNow = new Date(userNowString);
        const userLocalTime = {
          year: timeComponents.year,
          month: timeComponents.month,
          day: timeComponents.day,
          hours: timeComponents.hour,
          minutes: timeComponents.minute,
          seconds: timeComponents.second,
          date: userNow,
        };
        const nextOccurrence = this.calculateNextReminderTime(updated, userLocalTime, timezone);
        
        if (nextOccurrence) {
          // Format the next occurrence date
          const nextOccurrenceInUserTz = new Date(nextOccurrence.toLocaleString("en-US", { timeZone: timezone }));
          const hours = nextOccurrenceInUserTz.getHours();
          const minutes = nextOccurrenceInUserTz.getMinutes();
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Determine if it's today, tomorrow, or a specific date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const nextDateOnly = new Date(nextOccurrenceInUserTz);
          nextDateOnly.setHours(0, 0, 0, 0);
          
          let dateLabel = 'Today';
          if (nextDateOnly.getTime() === today.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateOnly.getTime() === tomorrow.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const day = nextOccurrenceInUserTz.getDate();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const month = monthNames[nextOccurrenceInUserTz.getMonth()];
            dateLabel = `${day} ${month}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
        }
      }
      
      // Message header is bold - reminder title is NOT bold
      const responseMessage = `⚠️ *Reminder Updated:*\nTitle: ${updated.title || reminder.title}\n${dateInfo ? `New Date: ${dateInfo}` : ''}`;

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

      // Message header is bold - reminder title is NOT bold
      return {
        success: true,
        message: `⛔ *Reminder Deleted:*\nTitle: ${reminder.title}`,
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

      // Message header is bold - reminder title is NOT bold
      return {
        success: true,
        message: `⏸️ *Reminder paused:*\nTitle: ${reminder.title}`,
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

      // Message header is bold - reminder title is NOT bold
      return {
        success: true,
        message: `▶️ *Reminder resumed:*\nTitle: ${reminder.title}`,
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
          message += `*${index + 1}.* "${event.title}"\n   ${eventDate} at ${eventTime}${locationText}\n\n`;
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
   * Resolve shopping list folder route (e.g., "Groceries" or "Groceries/Fruits") to folder ID
   * Similar to resolveFolderRoute but for shopping list folders
   */
  private async resolveShoppingListFolderRoute(folderRoute: string): Promise<string | null> {
    const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
    const folders = await getUserShoppingListFolders(this.db, this.userId);
    
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

  private async createShoppingListFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know what shopping list folder you'd like to create. Please specify the folder name.",
      };
    }

    // Check if folder already exists
    const existingFolders = await getUserShoppingListFolders(this.db, this.userId);
    const existingFolder = existingFolders.find(f => f.name.toLowerCase() === parsed.folderRoute!.toLowerCase());
    
    if (existingFolder) {
      return {
        success: false,
        message: `A shopping lists folder named "${parsed.folderRoute}" already exists.`,
      };
    }

    try {
      const folder = await createShoppingListFolder(this.db, {
        userId: this.userId,
        name: parsed.folderRoute,
      });

      return {
        success: true,
        message: `✅ *New Shopping Lists Folder Created:*\nName: ${parsed.folderRoute}`,
      };
    } catch (error) {
      logger.error({ error, folderName: parsed.folderRoute, userId: this.userId }, 'Failed to create shopping list folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the shopping lists folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async editShoppingListFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which shopping lists folder you'd like to edit. Please specify the folder name.",
      };
    }

    if (!parsed.newName) {
      return {
        success: false,
        message: "I need to know what you'd like to rename the folder to. Please specify the new name.",
      };
    }

    try {
      const folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
      if (!folderId) {
        return {
          success: false,
          message: `I couldn't find the shopping list folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      await updateShoppingListFolder(this.db, folderId, this.userId, {
        name: parsed.newName,
      });

      return {
        success: true,
        message: `✏️ *Shopping Lists Folder Updated:*\n"${parsed.folderRoute}" → "${parsed.newName}"`,
      };
    } catch (error) {
      logger.error({ error, folderRoute: parsed.folderRoute, userId: this.userId }, 'Failed to edit shopping list folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the shopping list folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async deleteShoppingListFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which shopping lists folder you'd like to delete. Please specify the folder name.",
      };
    }

    try {
      const folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
      if (!folderId) {
        return {
          success: false,
          message: `I couldn't find the shopping list folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      await deleteShoppingListFolder(this.db, folderId, this.userId);

      return {
        success: true,
        message: `⛔ *Shopping Lists Folder Deleted:*\n"${parsed.folderRoute}"`,
      };
    } catch (error) {
      logger.error({ error, folderRoute: parsed.folderRoute, userId: this.userId }, 'Failed to delete shopping list folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the shopping lists folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async createShoppingListSubfolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which parent folder you'd like to create a subfolder in. Please specify the parent folder name.",
      };
    }

    if (!parsed.newName) {
      return {
        success: false,
        message: "I need to know what you'd like to name the subfolder. Please specify the subfolder name.",
      };
    }

    try {
      const parentFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
      if (!parentFolderId) {
        return {
          success: false,
          message: `I couldn't find the parent folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      const folder = await createShoppingListFolder(this.db, {
        userId: this.userId,
        parentId: parentFolderId,
        name: parsed.newName,
      });

      return {
        success: true,
        message: `✅ *New Shopping Lists Subfolder Created:*\nParent: ${parsed.folderRoute}\nName: ${parsed.newName}`,
      };
    } catch (error) {
      logger.error({ error, parentFolder: parsed.folderRoute, subfolderName: parsed.newName, userId: this.userId }, 'Failed to create shopping list subfolder');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the subfolder "${parsed.newName}" in "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async listShoppingListFolders(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folders = await getUserShoppingListFolders(this.db, this.userId);
      
      // If a parent folder is specified, only show its subfolders
      if (parsed.folderRoute) {
        const parentFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
        if (!parentFolderId) {
          return {
            success: false,
            message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }

        // Find the parent folder and its subfolders
        const parentFolder = folders.find(f => f.id === parentFolderId);
        if (!parentFolder || !parentFolder.subfolders || parentFolder.subfolders.length === 0) {
          return {
            success: true,
            message: `📁 *No subfolders in "${parsed.folderRoute}"*`,
          };
        }

        let message = `📁 *Subfolders in "${parsed.folderRoute}":*\n`;
        parentFolder.subfolders.forEach((subfolder: any, index: number) => {
          message += `*${index + 1}.* ${subfolder.name}\n`;
        });

        return {
          success: true,
          message: message.trim(),
        };
      }

      // List all root folders
      if (folders.length === 0) {
        return {
          success: true,
          message: `📁 *You have no shopping lists folders*`,
        };
      }

      let message = `📁 *Shopping Lists Folders:*\n`;
      folders.forEach((folder: any, index: number) => {
        const subfolderCount = folder.subfolders?.length || 0;
        const itemCount = folder.items?.length || 0;
        message += `*${index + 1}.* ${folder.name}`;
        if (subfolderCount > 0 || itemCount > 0) {
          const details: string[] = [];
          if (subfolderCount > 0) {
            details.push(`${subfolderCount} subfolder${subfolderCount > 1 ? 's' : ''}`);
          }
          if (itemCount > 0) {
            details.push(`${itemCount} item${itemCount > 1 ? 's' : ''}`);
          }
          message += ` (${details.join(', ')})`;
        }
        message += '\n';
      });

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to list shopping list folders');
      return {
        success: false,
        message: `I'm sorry, I couldn't list your shopping lists folders. Please try again.`,
      };
    }
  }

  private async listTaskFolders(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folders = await getUserFolders(this.db, this.userId);
      
      // If a parent folder is specified, only show its subfolders
      if (parsed.folderRoute) {
        const parentFolderId = await this.resolveFolderRoute(parsed.folderRoute);
        if (!parentFolderId) {
          return {
            success: false,
            message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }

        // Find the parent folder and its subfolders
        const parentFolder = folders.find(f => f.id === parentFolderId);
        if (!parentFolder || !parentFolder.subfolders || parentFolder.subfolders.length === 0) {
          return {
            success: true,
            message: `📁 *No subfolders in "${parsed.folderRoute}"*`,
          };
        }

        let message = `📁 *Subfolders in "${parsed.folderRoute}":*\n`;
        parentFolder.subfolders.forEach((subfolder: any, index: number) => {
          message += `*${index + 1}.* ${subfolder.name}\n`;
        });

        return {
          success: true,
          message: message.trim(),
        };
      }

      // List all root folders
      if (folders.length === 0) {
        return {
          success: true,
          message: `📁 *You have no task folders*`,
        };
      }

      let message = `📁 *Task Folders:*\n`;
      folders.forEach((folder: any, index: number) => {
        const subfolderCount = folder.subfolders?.length || 0;
        const taskCount = folder.tasks?.length || 0;
        message += `*${index + 1}.* ${folder.name}`;
        if (subfolderCount > 0 || taskCount > 0) {
          const details: string[] = [];
          if (subfolderCount > 0) {
            details.push(`${subfolderCount} subfolder${subfolderCount > 1 ? 's' : ''}`);
          }
          if (taskCount > 0) {
            details.push(`${taskCount} task${taskCount > 1 ? 's' : ''}`);
          }
          message += ` (${details.join(', ')})`;
        }
        message += '\n';
      });

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to list task folders');
      return {
        success: false,
        message: `I'm sorry, I couldn't list your task folders. Please try again.`,
      };
    }
  }

  /**
   * Find task by name in a folder
   */
  private async findTaskByName(taskName: string, folderId: string) {
    const tasks = await getUserTasks(this.db, this.userId, { folderId });
    return tasks.find(t => t.title.toLowerCase() === taskName.toLowerCase());
  }

  /**
   * Resolve file folder route (e.g., "Documents" or "Work/Projects") to folder ID
   */
  private async resolveFileFolderRoute(folderRoute: string): Promise<string | null> {
    const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
    const folders = await getUserFileFolders(this.db, this.userId);
    
    // If only one part is provided, search for folder by name
    if (parts.length === 1) {
      const folderName = parts[0].toLowerCase();
      const folder = folders.find(f => f.name.toLowerCase() === folderName);
      return folder ? folder.id : null;
    }
    
    // Multiple parts: navigate through path (file folders don't have subfolders, so this is for future compatibility)
    const folderName = parts[parts.length - 1].toLowerCase();
    const folder = folders.find(f => f.name.toLowerCase() === folderName);
    return folder ? folder.id : null;
  }

  /**
   * Find file by name in a folder (or all folders if folderId is null)
   */
  private async findFileByName(fileName: string, folderId: string | null) {
    const files = await getUserFiles(this.db, this.userId);
    if (folderId) {
      return files.find(f => 
        f.title.toLowerCase() === fileName.toLowerCase() && 
        f.folderId === folderId
      );
    }
    return files.find(f => f.title.toLowerCase() === fileName.toLowerCase());
  }

  /**
   * Get address information for a saved address
   */
  private async getAddress(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const personName = parsed.addressName || parsed.taskName;
      const addressType = parsed.addressType || 'location';
      
      if (!personName) {
        return {
          success: false,
          message: "I need to know whose address you're looking for. Please specify a name.",
        };
      }
      
      // Get all user addresses
      const addresses = await getUserAddresses(this.db, this.userId);
      
      if (addresses.length === 0) {
        return {
          success: false,
          message: "You don't have any saved addresses yet. Please save an address first.",
        };
      }
      
      const personNameLower = personName.toLowerCase().trim();
      
      // Score-based matching: prioritize exact matches, then word-boundary matches, then partial matches
      const scoredMatches = addresses.map(addr => {
        const addrName = addr.name.toLowerCase().trim();
        let score = 0;
        let matchType = '';
        
        // Exact match (highest priority)
        if (addrName === personNameLower) {
          score = 100;
          matchType = 'exact';
        }
        // Word-boundary match (e.g., "Paul" matches "Paul Home" or "Home Paul" but not "Pauline")
        else if (new RegExp(`\\b${personNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(addrName)) {
          score = 80;
          matchType = 'word-boundary';
        }
        // Address name starts with person name (e.g., "Paul" matches "Paul's Home")
        else if (addrName.startsWith(personNameLower)) {
          score = 60;
          matchType = 'starts-with';
        }
        // Person name starts with address name (e.g., "Paul Smith" matches "Paul")
        else if (personNameLower.startsWith(addrName)) {
          score = 50;
          matchType = 'person-starts-with';
        }
        // Address name contains person name (e.g., "Paul" matches "Home Paul Office")
        else if (addrName.includes(personNameLower)) {
          score = 40;
          matchType = 'contains';
        }
        // Person name contains address name (e.g., "Paul Smith" matches "Paul")
        else if (personNameLower.includes(addrName)) {
          score = 30;
          matchType = 'person-contains';
        }
        // Word-by-word match (e.g., "Paul" matches "Paul Home" or "Home Paul")
        else {
          const addrWords = addrName.split(/\s+/);
          const personWords = personNameLower.split(/\s+/);
          
          for (const personWord of personWords) {
            if (personWord.length > 2) {
              for (const addrWord of addrWords) {
                if (addrWord === personWord) {
                  score = Math.max(score, 20);
                  matchType = 'word-match';
                  break;
                } else if (addrWord.includes(personWord) || personWord.includes(addrWord)) {
                  score = Math.max(score, 10);
                  matchType = 'word-partial';
                }
              }
            }
          }
        }
        
        return { address: addr, score, matchType };
      }).filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score); // Sort by score descending
      
      if (scoredMatches.length === 0) {
        // No matches found - suggest similar names
        const allNames = addresses.map(a => a.name).join(', ');
        return {
          success: false,
          message: `I couldn't find an address saved for "${personName}".\n\nYour saved addresses are: ${allNames || 'none'}\n\nPlease check the name and try again.`,
        };
      }
      
      // If multiple high-scoring matches, prefer exact or word-boundary matches
      const exactMatches = scoredMatches.filter(m => m.matchType === 'exact' || m.matchType === 'word-boundary');
      const bestMatches = exactMatches.length > 0 ? exactMatches : scoredMatches.slice(0, 1);
      
      // If there are multiple exact/word-boundary matches, ask user to be more specific
      if (exactMatches.length > 1) {
        const matchNames = exactMatches.map(m => m.address.name).join(', ');
        return {
          success: false,
          message: `I found multiple addresses matching "${personName}": ${matchNames}\n\nPlease be more specific (e.g., use the full address name).`,
        };
      }
      
      // Use the best match
      const matchingAddress = bestMatches[0]?.address;
      
      if (!matchingAddress) {
        return {
          success: false,
          message: `I couldn't find an address saved for "${personName}". Please check the name and try again.`,
        };
      }
      
      logger.info(
        {
          userId: this.userId,
          searchName: personName,
          foundName: matchingAddress.name,
          matchType: bestMatches[0]?.matchType,
          score: bestMatches[0]?.score,
          totalMatches: scoredMatches.length,
        },
        'Address matched successfully'
      );
      
      // Determine what to include based on addressType
      const includeAddress = addressType === 'location' || addressType === 'address' || addressType === 'all';
      const includePin = addressType === 'location' || addressType === 'pin' || addressType === 'all';
      
      // Build full address string
      const addressParts = [
        matchingAddress.street,
        matchingAddress.city,
        matchingAddress.state,
        matchingAddress.zip,
        matchingAddress.country,
      ].filter(Boolean);
      
      const fullAddress = addressParts.join(', ');
      
      // Get coordinates
      let lat: number | null = null;
      let lng: number | null = null;
      if (matchingAddress.latitude != null && matchingAddress.longitude != null) {
        const latNum = Number(matchingAddress.latitude);
        const lngNum = Number(matchingAddress.longitude);
        if (!isNaN(latNum) && !isNaN(lngNum)) {
          lat = latNum;
          lng = lngNum;
        }
      }
      
      // Build Google Maps link
      let mapsUrl = '';
      if (lat !== null && lng !== null) {
        mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
      } else if (fullAddress) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
      }
      
      // Build response based on request type
      let responseParts: string[] = [];
      
      // Format: *🏠 {name} Address* (bold title)
      responseParts.push(`*🏠 ${matchingAddress.name} Address*`);
      
      // Add address if requested
      if (includeAddress && fullAddress) {
        responseParts.push(`Address: ${fullAddress}`);
      } else if (includeAddress && !fullAddress) {
        responseParts.push(`Address: No address details available`);
      }
      
      // Add pin/coordinates if requested
      if (includePin && lat !== null && lng !== null) {
        responseParts.push(`Pin: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      } else if (includePin) {
        responseParts.push(`Pin: No coordinates available`);
      }
      
      const response = responseParts.join('\n');
      
      // Send Google Maps link as button if URL is available
      if (mapsUrl) {
        try {
          await this.whatsappService.sendCTAButtonMessage(this.recipient, {
            bodyText: response,
            buttonText: 'Open in Google Maps',
            buttonUrl: mapsUrl,
          });
          // Return empty message since button message already contains the full content
          return {
            success: true,
            message: '',
          };
        } catch (error) {
          logger.error(
            {
              error,
              userId: this.userId,
              addressName: parsed.addressName,
              mapsUrl,
            },
            'Failed to send Google Maps button'
          );
          // Fallback to text message with URL if button fails
          return {
            success: true,
            message: `${response}\n\n${mapsUrl}`,
          };
        }
      }
      
      return {
        success: true,
        message: response,
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId: this.userId,
          addressName: parsed.addressName,
          addressType: parsed.addressType,
        },
        'Failed to get address'
      );
      
      return {
        success: false,
        message: "I encountered an error while looking up the address. Please try again.",
      };
    }
  }

  /**
   * Create a new address
   */
  private async createAddressAction(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const name = parsed.addressName || parsed.taskName;
      
      if (!name) {
        return {
          success: false,
          message: "I need a name for this address. Please specify a name like 'Paul', 'Home', or 'Office'.",
        };
      }

      // Parse additional fields from newName (stored as "field:value|field:value")
      const fields: Record<string, string> = {};
      if (parsed.newName) {
        const fieldPairs = parsed.newName.split('|');
        for (const pair of fieldPairs) {
          const [field, value] = pair.split(':').map(s => s.trim());
          if (field && value) {
            fields[field.toLowerCase()] = value;
          }
        }
      }

      const addressData: any = {
        userId: this.userId,
        name: name.trim(),
        street: fields.street || null,
        city: fields.city || null,
        state: fields.state || null,
        zip: fields.zip || null,
        country: fields.country || null,
        latitude: fields.latitude ? parseFloat(fields.latitude) : null,
        longitude: fields.longitude ? parseFloat(fields.longitude) : null,
      };

      // Validate coordinates
      if (addressData.latitude !== null && (isNaN(addressData.latitude) || addressData.latitude < -90 || addressData.latitude > 90)) {
        addressData.latitude = null;
      }
      if (addressData.longitude !== null && (isNaN(addressData.longitude) || addressData.longitude < -180 || addressData.longitude > 180)) {
        addressData.longitude = null;
      }

      const address = await createAddress(this.db, addressData);

      // Build Google Maps link
      let mapsUrl = '';
      if (address.latitude != null && address.longitude != null) {
        const lat = Number(address.latitude);
        const lng = Number(address.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        }
      }
      
      // If no coordinates, try to use address
      if (!mapsUrl) {
        const addressParts = [
          address.street,
          address.city,
          address.state,
          address.zip,
          address.country,
        ].filter(Boolean);
        
        const fullAddress = addressParts.join(', ');
        if (fullAddress) {
          mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
        }
      }

      // Format: *✅️ New Location Added*\nName: {name}
      const messageText = `*✅️ New Location Added*\nName: ${name}`;

      // Send Google Maps link as button if URL is available
      if (mapsUrl) {
        try {
          await this.whatsappService.sendCTAButtonMessage(this.recipient, {
            bodyText: messageText,
            buttonText: 'Open in Google Maps',
            buttonUrl: mapsUrl,
          });
          // Return empty message since button message already contains the content
          return {
            success: true,
            message: '',
          };
        } catch (error) {
          logger.error(
            {
              error,
              userId: this.userId,
              addressName: name,
              mapsUrl,
            },
            'Failed to send Google Maps button'
          );
          // Fallback to text message with URL if button fails
          return {
            success: true,
            message: `${messageText}\n\n${mapsUrl}`,
          };
        }
      }

      return {
        success: true,
        message: messageText,
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId: this.userId,
          addressName: parsed.addressName || parsed.taskName,
        },
        'Failed to create address'
      );

      return {
        success: false,
        message: "I encountered an error while saving the address. Please try again.",
      };
    }
  }

  /**
   * Update an existing address
   */
  private async updateAddressAction(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const name = parsed.addressName || parsed.taskName;
      const changes = parsed.newName; // Contains the changes description

      if (!name) {
        return {
          success: false,
          message: "I need to know which address to update. Please specify the address name.",
        };
      }

      if (!changes) {
        return {
          success: false,
          message: "I need to know what to change. Please specify what you want to update.",
        };
      }

      // Get all user addresses to find the one to update
      const addresses = await getUserAddresses(this.db, this.userId);
      
      // Find matching address
      const matchingAddress = addresses.find(addr => {
        const addrName = addr.name.toLowerCase().trim();
        const searchName = name.toLowerCase().trim();
        return addrName === searchName || addrName.includes(searchName) || searchName.includes(addrName);
      });

      if (!matchingAddress) {
        return {
          success: false,
          message: `I couldn't find an address named "${name}". Please check the name and try again.`,
        };
      }

      // Parse changes (format: "field to value" or "field: value")
      const updateData: any = {};
      const changesLower = changes.toLowerCase();

      // Parse name change
      if (changesLower.includes('name to')) {
        const nameMatch = changes.match(/name\s+to\s+(.+?)(?:\s|$)/i);
        if (nameMatch) {
          updateData.name = nameMatch[1].trim();
        }
      }

      // Parse street change
      if (changesLower.includes('street to')) {
        const streetMatch = changes.match(/street\s+to\s+(.+?)(?:\s|$)/i);
        if (streetMatch) {
          updateData.street = streetMatch[1].trim();
        }
      }

      // Parse city change
      if (changesLower.includes('city to')) {
        const cityMatch = changes.match(/city\s+to\s+(.+?)(?:\s|$)/i);
        if (cityMatch) {
          updateData.city = cityMatch[1].trim();
        }
      }

      // Parse state change
      if (changesLower.includes('state to')) {
        const stateMatch = changes.match(/state\s+to\s+(.+?)(?:\s|$)/i);
        if (stateMatch) {
          updateData.state = stateMatch[1].trim();
        }
      }

      // Parse zip change
      if (changesLower.includes('zip to') || changesLower.includes('postal code to')) {
        const zipMatch = changes.match(/(?:zip|postal\s+code)\s+to\s+(.+?)(?:\s|$)/i);
        if (zipMatch) {
          updateData.zip = zipMatch[1].trim();
        }
      }

      // Parse country change
      if (changesLower.includes('country to')) {
        const countryMatch = changes.match(/country\s+to\s+(.+?)(?:\s|$)/i);
        if (countryMatch) {
          updateData.country = countryMatch[1].trim();
        }
      }

      // Parse coordinates
      if (changesLower.includes('latitude to') || changesLower.includes('longitude to') || changesLower.includes('coordinates to')) {
        const latMatch = changes.match(/latitude\s+to\s+(-?\d+\.?\d*)/i);
        const lngMatch = changes.match(/longitude\s+to\s+(-?\d+\.?\d*)/i);
        const coordsMatch = changes.match(/coordinates\s+to\s+(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/i);
        
        if (coordsMatch) {
          updateData.latitude = parseFloat(coordsMatch[1]);
          updateData.longitude = parseFloat(coordsMatch[2]);
        } else {
          if (latMatch) {
            updateData.latitude = parseFloat(latMatch[1]);
          }
          if (lngMatch) {
            updateData.longitude = parseFloat(lngMatch[1]);
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: false,
          message: "I couldn't understand what you want to change. Please specify the field and new value (e.g., 'city to Durban').",
        };
      }

      // Validate coordinates
      if (updateData.latitude !== undefined && (isNaN(updateData.latitude) || updateData.latitude < -90 || updateData.latitude > 90)) {
        delete updateData.latitude;
      }
      if (updateData.longitude !== undefined && (isNaN(updateData.longitude) || updateData.longitude < -180 || updateData.longitude > 180)) {
        delete updateData.longitude;
      }

      const updatedAddress = await updateAddress(this.db, matchingAddress.id, this.userId, updateData);

      if (!updatedAddress) {
        return {
          success: false,
          message: "I encountered an error while updating the address. Please try again.",
        };
      }

      return {
        success: true,
        message: `✅ Address "${name}" has been updated successfully!`,
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId: this.userId,
          addressName: parsed.addressName || parsed.taskName,
        },
        'Failed to update address'
      );

      return {
        success: false,
        message: "I encountered an error while updating the address. Please try again.",
      };
    }
  }

  /**
   * Delete an address
   */
  private async deleteAddressAction(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const name = parsed.addressName || parsed.taskName;

      if (!name) {
        return {
          success: false,
          message: "I need to know which address to delete. Please specify the address name.",
        };
      }

      // Get all user addresses to find the one to delete
      const addresses = await getUserAddresses(this.db, this.userId);
      
      // Find matching address
      const matchingAddress = addresses.find(addr => {
        const addrName = addr.name.toLowerCase().trim();
        const searchName = name.toLowerCase().trim();
        return addrName === searchName || addrName.includes(searchName) || searchName.includes(addrName);
      });

      if (!matchingAddress) {
        return {
          success: false,
          message: `I couldn't find an address named "${name}". Please check the name and try again.`,
        };
      }

      await deleteAddress(this.db, matchingAddress.id, this.userId);

      // Format: *⛔ Location Deleted:*\nName: {name}
      const message = `*⛔ Location Deleted:*\nName: ${matchingAddress.name}`;

      return {
        success: true,
        message,
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId: this.userId,
          addressName: parsed.addressName || parsed.taskName,
        },
        'Failed to delete address'
      );

      return {
        success: false,
        message: "I encountered an error while deleting the address. Please try again.",
      };
    }
  }

  /**
   * List all addresses
   */
  private async listAddresses(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const filter = parsed.listFilter || 'all';
      
      let addresses = await getUserAddresses(this.db, this.userId);

      // Filter by folder if specified (future enhancement)
      // For now, we just list all addresses

      if (addresses.length === 0) {
        return {
          success: true,
          message: "*🏠 All Locations*\n(No locations saved yet)",
        };
      }

      // Format: *🏠 All Locations*\n*1.* {name1}\n*2.* {name2}\n*3.* {name3} (bold title and numbers with period)
      const addressList = addresses.map((addr, index) => {
        return `*${index + 1}.* ${addr.name}`;
      }).join('\n');

      const message = `*🏠 All Locations*\n${addressList}`;

      return {
        success: true,
        message,
      };
    } catch (error) {
      logger.error(
        {
          error,
          userId: this.userId,
        },
        'Failed to list addresses'
      );

      return {
        success: false,
        message: "I encountered an error while retrieving your addresses. Please try again.",
      };
    }
  }

  /**
   * Resolve friend folder route (e.g., "Work") to folder ID
   */
  private async resolveFriendFolderRoute(folderRoute: string): Promise<string | null> {
    const folders = await getUserFriendFolders(this.db, this.userId);
    const folderName = folderRoute.toLowerCase();
    const folder = folders.find(f => f.name.toLowerCase() === folderName);
    return folder ? folder.id : null;
  }

  /**
   * Create a friend
   */
  private async createFriend(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know the friend's name. Please specify the name.",
        };
      }

      // Resolve folder if specified
      let folderId: string | null = null;
      if (parsed.folderRoute) {
        folderId = await this.resolveFriendFolderRoute(parsed.folderRoute) || null;
        if (parsed.folderRoute && !folderId) {
          return {
            success: false,
            message: `I couldn't find the friend folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }
      }

      // Try to find connected user by email or phone if provided
      let connectedUserId: string | null = null;
      if (parsed.email || parsed.phone) {
        const searchResults = await searchUsersByEmailOrPhoneForFriends(
          this.db,
          parsed.email || parsed.phone || '',
          this.userId
        );
        if (searchResults.length > 0) {
          connectedUserId = searchResults[0].id;
        }
      }

      const friend = await createFriend(this.db, {
        userId: this.userId,
        name: parsed.taskName,
        folderId,
        connectedUserId,
        email: parsed.email || null,
        phone: parsed.phone || null,
        addressType: parsed.friendAddressType || null,
        street: parsed.street || null,
        city: parsed.city || null,
        state: parsed.state || null,
        zip: parsed.zip || null,
        country: parsed.country || null,
        latitude: parsed.latitude || null,
        longitude: parsed.longitude || null,
      });

      let message = `✅ *Friend Created*\nName: ${friend.name}`;
      if (friend.email) message += `\nEmail: ${friend.email}`;
      if (friend.phone) message += `\nPhone: ${friend.phone}`;
      if (parsed.folderRoute) message += `\nFolder: ${parsed.folderRoute}`;

      return {
        success: true,
        message,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, friendName: parsed.taskName }, 'Failed to create friend');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the friend "${parsed.taskName}". Please try again.`,
      };
    }
  }

  /**
   * Update a friend
   */
  private async updateFriend(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which friend you want to update. Please specify the friend name.",
        };
      }

      if (!parsed.newName) {
        return {
          success: false,
          message: "I need to know what changes you want to make. Please specify the changes.",
        };
      }

      // Find friend by name
      const friends = await getUserFriends(this.db, this.userId);
      const friend = friends.find(f => 
        f.name.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(f.name.toLowerCase())
      );

      if (!friend) {
        return {
          success: false,
          message: `I couldn't find a friend named "${parsed.taskName}". Please check the name and try again.`,
        };
      }

      // Parse changes from newName
      const changes = parsed.newName.toLowerCase();
      const updateData: any = {};

      // Check for name changes
      if (changes.includes('name to') || changes.includes('name:')) {
        const nameMatch = parsed.newName.match(/name\s+(?:to|:)\s*(.+?)(?:\s|$)/i);
        if (nameMatch) {
          updateData.name = nameMatch[1].trim();
        }
      }

      // Check for email changes
      if (changes.includes('email to') || changes.includes('email:')) {
        const emailMatch = parsed.newName.match(/email\s+(?:to|:)\s*([^\s]+)/i);
        if (emailMatch) {
          updateData.email = emailMatch[1].trim();
        }
      }

      // Check for phone changes
      if (changes.includes('phone to') || changes.includes('phone:')) {
        const phoneMatch = parsed.newName.match(/phone\s+(?:to|:)\s*([^\s]+)/i);
        if (phoneMatch) {
          updateData.phone = phoneMatch[1].trim();
        }
      }

      // Check for address field changes
      if (changes.includes('street to') || changes.includes('street:')) {
        const streetMatch = parsed.newName.match(/street\s+(?:to|:)\s*(.+?)(?:\s|$)/i);
        if (streetMatch) {
          updateData.street = streetMatch[1].trim();
        }
      }

      if (changes.includes('city to') || changes.includes('city:')) {
        const cityMatch = parsed.newName.match(/city\s+(?:to|:)\s*(.+?)(?:\s|$)/i);
        if (cityMatch) {
          updateData.city = cityMatch[1].trim();
        }
      }

      if (changes.includes('state to') || changes.includes('state:')) {
        const stateMatch = parsed.newName.match(/state\s+(?:to|:)\s*(.+?)(?:\s|$)/i);
        if (stateMatch) {
          updateData.state = stateMatch[1].trim();
        }
      }

      if (changes.includes('zip to') || changes.includes('zip:')) {
        const zipMatch = parsed.newName.match(/zip\s+(?:to|:)\s*([^\s]+)/i);
        if (zipMatch) {
          updateData.zip = zipMatch[1].trim();
        }
      }

      if (changes.includes('country to') || changes.includes('country:')) {
        const countryMatch = parsed.newName.match(/country\s+(?:to|:)\s*(.+?)(?:\s|$)/i);
        if (countryMatch) {
          updateData.country = countryMatch[1].trim();
        }
      }

      // Check for coordinate changes
      if (changes.includes('latitude to') || changes.includes('latitude:')) {
        const latMatch = parsed.newName.match(/latitude\s+(?:to|:)\s*([^\s]+)/i);
        if (latMatch) {
          updateData.latitude = parseFloat(latMatch[1].trim());
        }
      }

      if (changes.includes('longitude to') || changes.includes('longitude:')) {
        const lngMatch = parsed.newName.match(/longitude\s+(?:to|:)\s*([^\s]+)/i);
        if (lngMatch) {
          updateData.longitude = parseFloat(lngMatch[1].trim());
        }
      }

      if (Object.keys(updateData).length === 0) {
        return {
          success: false,
          message: "I couldn't understand what changes you want to make. Please specify the field and new value (e.g., 'email to new@example.com').",
        };
      }

      const updated = await updateFriend(this.db, friend.id, this.userId, updateData);

      if (!updated) {
        return {
          success: false,
          message: "I encountered an error while updating the friend. Please try again.",
        };
      }

      return {
        success: true,
        message: `✅ *Friend Updated*\nName: ${updated.name}`,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, friendName: parsed.taskName }, 'Failed to update friend');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the friend "${parsed.taskName}". Please try again.`,
      };
    }
  }

  /**
   * Delete a friend
   */
  private async deleteFriend(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.taskName) {
        return {
          success: false,
          message: "I need to know which friend you want to delete. Please specify the friend name.",
        };
      }

      // Find friend by name
      const friends = await getUserFriends(this.db, this.userId);
      const friend = friends.find(f => 
        f.name.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(f.name.toLowerCase())
      );

      if (!friend) {
        return {
          success: false,
          message: `I couldn't find a friend named "${parsed.taskName}". Please check the name and try again.`,
        };
      }

      await deleteFriend(this.db, friend.id, this.userId);

      return {
        success: true,
        message: `⛔ *Friend Deleted*\nName: ${friend.name}`,
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, friendName: parsed.taskName }, 'Failed to delete friend');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the friend "${parsed.taskName}". Please try again.`,
      };
    }
  }

  /**
   * List friends
   */
  private async listFriends(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const friends = await getUserFriends(this.db, this.userId);
      
      // Filter by folder if specified
      let filteredFriends = friends;
      if (parsed.folderRoute) {
        const folderId = await this.resolveFriendFolderRoute(parsed.folderRoute);
        if (!folderId) {
          return {
            success: false,
            message: `I couldn't find the friend folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }
        filteredFriends = friends.filter(f => f.folderId === folderId);
      }

      if (filteredFriends.length === 0) {
        const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
        return {
          success: true,
          message: `👥 *Friends${folderText}*\n\nNone`,
        };
      }

      let message = parsed.folderRoute 
        ? `👥 *Friends in "${parsed.folderRoute}":*\n`
        : `👥 *Friends:*\n`;
      
      filteredFriends.slice(0, 20).forEach((friend, index) => {
        message += `*${index + 1}.* ${friend.name}`;
        if (friend.email || friend.phone) {
          const details: string[] = [];
          if (friend.email) details.push(`📧 ${friend.email}`);
          if (friend.phone) details.push(`📞 ${friend.phone}`);
          message += `\n   ${details.join(' | ')}`;
        }
        message += '\n';
      });

      if (filteredFriends.length > 20) {
        message += `... and ${filteredFriends.length - 20} more friends.`;
      }

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to list friends');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your friends. Please try again.",
      };
    }
  }

  /**
   * Create a friend folder
   */
  private async createFriendFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.folderRoute) {
        return {
          success: false,
          message: "I need to know what friend folder you'd like to create. Please specify the folder name.",
        };
      }

      // Check if folder already exists
      const existingFolders = await getUserFriendFolders(this.db, this.userId);
      const existingFolder = existingFolders.find(f => f.name.toLowerCase() === parsed.folderRoute.toLowerCase());
      
      if (existingFolder) {
        return {
          success: false,
          message: `A friend folder named "${parsed.folderRoute}" already exists.`,
        };
      }

      const folder = await createFriendFolder(this.db, {
        userId: this.userId,
        name: parsed.folderRoute,
      });

      return {
        success: true,
        message: `✅ *Friend Folder Created*\nName: ${folder.name}`,
      };
    } catch (error) {
      logger.error({ error, folderName: parsed.folderRoute, userId: this.userId }, 'Failed to create friend folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the friend folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  /**
   * Update a friend folder
   */
  private async updateFriendFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.folderRoute) {
        return {
          success: false,
          message: "I need to know which friend folder you'd like to edit. Please specify the folder name.",
        };
      }

      if (!parsed.newName) {
        return {
          success: false,
          message: "I need to know what you'd like to rename the folder to. Please specify the new name.",
        };
      }

      const folderId = await this.resolveFriendFolderRoute(parsed.folderRoute);
      if (!folderId) {
        return {
          success: false,
          message: `I couldn't find the friend folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      const updated = await updateFriendFolder(this.db, folderId, this.userId, {
        name: parsed.newName,
      });

      if (!updated) {
        return {
          success: false,
          message: "I encountered an error while updating the friend folder. Please try again.",
        };
      }

      return {
        success: true,
        message: `✏️ *Friend Folder Updated*\n"${parsed.folderRoute}" → "${parsed.newName}"`,
      };
    } catch (error) {
      logger.error({ error, folderRoute: parsed.folderRoute, userId: this.userId }, 'Failed to update friend folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't update the friend folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  /**
   * Delete a friend folder
   */
  private async deleteFriendFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      if (!parsed.folderRoute) {
        return {
          success: false,
          message: "I need to know which friend folder you'd like to delete. Please specify the folder name.",
        };
      }

      const folderId = await this.resolveFriendFolderRoute(parsed.folderRoute);
      if (!folderId) {
        return {
          success: false,
          message: `I couldn't find the friend folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      await deleteFriendFolder(this.db, folderId, this.userId);

      return {
        success: true,
        message: `⛔ *Friend Folder Deleted*\n"${parsed.folderRoute}"`,
      };
    } catch (error) {
      logger.error({ error, folderRoute: parsed.folderRoute, userId: this.userId }, 'Failed to delete friend folder');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the friend folder "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  /**
   * List friend folders
   */
  private async listFriendFolders(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folders = await getUserFriendFolders(this.db, this.userId);
      
      if (folders.length === 0) {
        return {
          success: true,
          message: `📁 *You have no friend folders*`,
        };
      }

      let message = `📁 *Friend Folders:*\n`;
      folders.forEach((folder: any, index: number) => {
        message += `*${index + 1}.* ${folder.name}\n`;
      });

      return {
        success: true,
        message: message.trim(),
      };
    } catch (error) {
      logger.error({ error, userId: this.userId }, 'Failed to list friend folders');
      return {
        success: false,
        message: `I'm sorry, I couldn't list your friend folders. Please try again.`,
      };
    }
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

