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
  getUserNoteFolders,
  deleteNote,
  getRemindersByUserId,
  getPrimaryCalendar,
  createReminder,
  updateReminder,
  deleteReminder,
  toggleReminderActive,
  getReminderById,
  getUserPreferences,
  type CreateReminderInput,
  type UpdateReminderInput,
  type ReminderFrequency,
} from '@imaginecalendar/database/queries';
import {
  createTaskShare,
  deleteTaskShare,
  getResourceShares,
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
  getFileResourceShares,
  deleteFileShare,
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
  getPrimaryShoppingListFolder,
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
  getNoteResourceShares,
  deleteNoteShare,
  createNoteShare,
  getVerifiedWhatsappNumberByPhone,
  logOutgoingWhatsAppMessage,
  getUserSubscription,
  getPlanById,
} from '@imaginecalendar/database/queries';
import { logger } from '@imaginecalendar/logger';
import { WhatsAppService } from '@imaginecalendar/whatsapp';
import { CalendarService } from './calendar-service';
import type { CalendarIntent } from '@imaginecalendar/ai-services';
import { getCategorySuggestion } from '@/lib/shopping-list-categorization';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ParsedAction {
  action: string;
  resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event' | 'document' | 'address' | 'friend' | 'shopping';
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
  category?: string; // For shopping list items: category name
  reminderCategory?: string; // For reminders: category name
}

// In-memory cache to store last displayed list context for each user
// Key: userId, Value: { type: 'tasks' | 'notes' | 'shopping' | 'event' | 'reminder', items: Array<{ id: string, number: number, name?: string, calendarId?: string }> }
const listContextCache = new Map<string, { type: 'tasks' | 'notes' | 'shopping' | 'event' | 'reminder', items: Array<{ id: string, number: number, name?: string, calendarId?: string }>, folderRoute?: string }>();
const LIST_CONTEXT_TTL = 10 * 60 * 1000; // 10 minutes

export class ActionExecutor {
  // Constants for date parsing - defined once to avoid repetition
  private static readonly MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  private static readonly MONTH_ABBREVIATIONS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  private static readonly CAPITALIZED_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  private static readonly MONTH_ABBREVIATIONS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Constants for day names
  private static readonly DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  private static readonly CAPITALIZED_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  // Constants for date validation
  private static readonly INVALID_DATE_TIME = 0;
  private static readonly INVALID_DATE = new Date(0);
  private static readonly MILLISECONDS_PER_MINUTE = 60 * 1000;
  private static readonly PAST_TIME_TOLERANCE_MS = 1 * ActionExecutor.MILLISECONDS_PER_MINUTE;
  
  // Constants for date string formatting
  private static readonly DATE_SEPARATOR = '-';
  private static readonly TIME_SEPARATOR = 'T';
  private static readonly MIDNIGHT_TIME = '00:00:00';

  constructor(
    private db: Database,
    private userId: string,
    private whatsappService: WhatsAppService,
    private recipient: string
  ) {}
  
  /**
   * Parse a specific date from text (e.g., "3rd February", "27th January", "3 Feb", "Feb 3rd")
   * @param text - The text to parse
   * @returns The matched date string if found, null otherwise
   */
  private parseSpecificDateFromText(text: string): string | null {
    const lowerText = text.toLowerCase();
    
    for (let i = 0; i < ActionExecutor.MONTH_NAMES.length; i++) {
      const monthName = ActionExecutor.MONTH_NAMES[i];
      const monthAb = ActionExecutor.MONTH_ABBREVIATIONS[i];
      
      // Pattern 1: "[day] [month]" (e.g., "3rd February", "27 January")
      const pattern1 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}|(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthAb}`, 'i');
      // Pattern 2: "[month] [day]" (e.g., "February 3rd", "Jan 27")
      const pattern2 = new RegExp(`${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?|${monthAb}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i');
      
      const match1 = lowerText.match(pattern1);
      const match2 = lowerText.match(pattern2);
      const match = match1 || match2;
      
      if (match) {
        const dayNum = parseInt(match[1] || match[2] || '0', 10);
        if (dayNum >= 1 && dayNum <= 31) {
          // Return the full matched portion to preserve the exact format
          return match[0];
        }
      }
    }
    
    return null;
  }
  
  /**
   * Parse a specific date and extract day, month, year components
   * @param text - The text to parse (e.g., "3rd February", "27th January")
   * @param currentYear - The current year to use if not specified
   * @returns An object with day, month (0-based), and year, or null if not found
   */
  private parseSpecificDateComponents(
    text: string,
    currentYear: number
  ): { day: number; month: number; year: number } | null {
    const lowerText = text.toLowerCase();
    
    for (let i = 0; i < ActionExecutor.MONTH_NAMES.length; i++) {
      const monthName = ActionExecutor.MONTH_NAMES[i];
      const monthAb = ActionExecutor.MONTH_ABBREVIATIONS[i];
      
      // Pattern 1: "[day] [month]" (e.g., "27th January", "27 January")
      const match1 = lowerText.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthName}`, 'i')) ||
                    lowerText.match(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthAb}`, 'i'));
      
      // Pattern 2: "[month] [day]" (e.g., "January 27th", "Jan 27")
      const match2 = lowerText.match(new RegExp(`${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i')) ||
                    lowerText.match(new RegExp(`${monthAb}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
      
      const match = match1 || match2;
      
      if (match) {
        const dayNum = parseInt(match[1] || '0', 10);
        if (dayNum >= 1 && dayNum <= 31) {
          // Use current year for the date (allow past dates - don't automatically move to next year)
          let targetDate = new Date(currentYear, i, dayNum);
          
          // Check if the date is valid (handles cases like Feb 30)
          if (targetDate.getDate() === dayNum) {
            return {
              day: dayNum,
              month: i, // 0-based
              year: targetDate.getFullYear(),
            };
          }
        }
      }
    }
    
    return null;
  }
  
  /**
   * Extract month name from text (month-only, not specific dates)
   * @param text - The text to search
   * @param filterParts - Optional array of text parts to search (if already split)
   * @returns The month name if found, null otherwise
   */
  private extractMonthNameFromText(text: string, filterParts?: string[]): string | null {
    const parts = filterParts || text.toLowerCase().split(/\s+/);
    
    for (const part of parts) {
      const cleaned = part.replace(/[^a-z]/gi, '');
      const monthIndex = ActionExecutor.MONTH_NAMES.findIndex(m => m === cleaned);
      if (monthIndex !== -1) {
        return ActionExecutor.MONTH_NAMES[monthIndex];
      }
    }
    
    return null;
  }
  
  /**
   * Get month abbreviation (e.g., "Jan", "Feb") from month index (0-based)
   * @param monthIndex - The month index (0-11)
   * @returns The month abbreviation
   */
  private getMonthAbbreviation(monthIndex: number): string {
    return ActionExecutor.MONTH_ABBREVIATIONS_SHORT[monthIndex] || 'Jan';
  }
  
  /**
   * Get capitalized month name (e.g., "January", "February") from month index (0-based)
   * @param monthIndex - The month index (0-11)
   * @returns The capitalized month name
   */
  private getCapitalizedMonthName(monthIndex: number): string {
    return ActionExecutor.CAPITALIZED_MONTHS[monthIndex] || 'January';
  }
  
  /**
   * Store list context for number-based operations (deletion, viewing, etc.)
   */
  private storeListContext(type: 'tasks' | 'notes' | 'shopping' | 'event' | 'reminder', items: Array<{ id: string, number: number, name?: string, calendarId?: string }>, folderRoute?: string): void {
    listContextCache.set(this.userId, { type, items, folderRoute });
    // Auto-cleanup after TTL
    setTimeout(() => {
      listContextCache.delete(this.userId);
    }, LIST_CONTEXT_TTL);
  }
  
  /**
   * Get list context for number-based operations (deletion, viewing, etc.)
   */
  private getListContext(): { type: 'tasks' | 'notes' | 'shopping' | 'event' | 'reminder', items: Array<{ id: string, number: number, name?: string, calendarId?: string }>, folderRoute?: string } | null {
    return listContextCache.get(this.userId) || null;
  }
  
  /**
   * Clear list context
   */
  private clearListContext(): void {
    listContextCache.delete(this.userId);
  }

  /**
   * Normalize recipient name by removing indicator words that signal friend groups/tags
   * Examples: "family friends" → "family", "work contacts" → "work", "everyone in work contact list" → "work"
   */
  private normalizeRecipient(recipient: string): string {
    if (!recipient) return recipient;
    
    let normalized = recipient.trim();
    
    // Handle "everyone in [tag] [list/contact/folder]" pattern
    const everyoneMatch = normalized.match(/^everyone\s+in\s+(.+?)(?:\s+(?:contact|list|folder))?$/i);
    if (everyoneMatch) {
      normalized = everyoneMatch[1].trim();
    }
    
    // Remove indicator words: friends, contacts, group, guys, people
    // Pattern: "[tag] [indicator]" → extract "[tag]" only
    const indicatorWords = ['friends', 'contacts', 'group', 'guys', 'people'];
    
    for (const indicator of indicatorWords) {
      // Match pattern: "[tag] [indicator]" (case-insensitive)
      // Use case-insensitive regex on the original string to preserve case of the tag
      const regex = new RegExp(`^(.+?)\\s+${indicator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
      const match = normalized.match(regex);
      if (match) {
        normalized = match[1].trim();
        break; // Only remove one indicator word
      }
    }
    
    return normalized.trim();
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
    let resourceType: 'task' | 'folder' | 'note' | 'reminder' | 'event' | 'document' | 'address' | 'friend' | 'shopping' = 'task';
    let taskName: string | undefined;
    let folderName: string | undefined;
    let folderRoute: string | undefined;
    let targetFolderRoute: string | undefined;
    let recipient: string | undefined;
    let newName: string | undefined;
    let status: string | undefined;
    let listFilter: string | undefined;
    let category: string | undefined;
    let typeFilter: ReminderFrequency | undefined;
    let reminderCategory: string | undefined;
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
      resourceType = 'shopping';
      let category: string | undefined;
      
      // Try format with both folder and category: "Create a shopping item: {item} - on folder: {folder} - category: {category}"
      const folderAndCategoryMatch = trimmed.match(/^Create a shopping item:\s*(.+?)\s*-\s*on folder:\s*(.+?)\s*-\s*category:\s*(.+)$/i);
      if (folderAndCategoryMatch) {
        taskName = folderAndCategoryMatch[1].trim();
        folderRoute = folderAndCategoryMatch[2].trim();
        category = folderAndCategoryMatch[3].trim();
      } else {
        // Try format with category only: "Create a shopping item: {item} - category: {category}"
        const categoryOnlyMatch = trimmed.match(/^Create a shopping item:\s*(.+?)\s*-\s*category:\s*(.+)$/i);
        if (categoryOnlyMatch) {
          taskName = categoryOnlyMatch[1].trim();
          category = categoryOnlyMatch[2].trim();
          folderRoute = undefined;
        } else {
          // Try format with folder only: "Create a shopping item: {item} - on folder: {folder}"
          const folderOnlyMatch = trimmed.match(/^Create a shopping item:\s*(.+?)\s*-\s*on folder:\s*(.+)$/i);
          if (folderOnlyMatch) {
            taskName = folderOnlyMatch[1].trim();
            folderRoute = folderOnlyMatch[2].trim();
          } else {
            // Simple format: "Create a shopping item: {item}"
            const simpleMatch = trimmed.match(/^Create a shopping item:\s*(.+)$/i);
            if (simpleMatch) {
              taskName = simpleMatch[1].trim();
              folderRoute = undefined;
            } else {
              missingFields.push('item name');
            }
          }
        }
      }
      
    } else if (trimmed.startsWith('List shopping items:')) {
      action = 'list';
      resourceType = 'shopping';
      // Match: "List shopping items: {folder|all} - status: {open|completed|all}"
      const matchWithStatus = trimmed.match(/^List shopping items:\s*(.+?)\s*-\s*status:\s*(.+)$/i);
      if (matchWithStatus) {
        // Preserve the raw folder route (including "all") so downstream logic
        // can distinguish between "all" vs no folder (Home list)
        folderRoute = matchWithStatus[1].trim();
        status = matchWithStatus[2].trim();
      } else {
        // Match: "List shopping items: {folder|all}" (no status)
        const matchWithoutStatus = trimmed.match(/^List shopping items:\s*(.+)$/i);
        if (matchWithoutStatus) {
          const folderOrAll = matchWithoutStatus[1].trim();
          // Preserve "all" so downstream logic can handle it specially
          folderRoute = folderOrAll;
          status = 'all'; // Default to all statuses
        } else {
          missingFields.push('folder or "all"');
        }
      }
    } else if (trimmed.startsWith('Edit a shopping item:')) {
      action = 'edit';
      resourceType = 'shopping';
      const match = trimmed.match(/^Edit a shopping item:\s*(.+?)\s*-\s*to:\s*(.+?)(?:\s*-\s*on folder:\s*(.+))?$/i);
      if (match) {
        taskName = match[1].trim();
        newName = match[2].trim();
        folderRoute = match[3]?.trim();
      } else {
        missingFields.push('item name, new name, or folder');
      }
    } else if (trimmed.startsWith('Delete a shopping item:') || trimmed.startsWith('Delete shopping items:') || trimmed.startsWith('Delete shopping item:')) {
      action = 'delete';
      resourceType = 'shopping';
      // Extract everything after "Delete a shopping item:" or "Delete shopping items:" or "Delete shopping item:"
      const afterPrefix = trimmed.replace(/^Delete (a )?shopping items?:\s*/i, '').trim();
      
      logger.info({ afterPrefix, trimmed }, 'Parsing Delete shopping item command');
      
      // Check if it's a number-based deletion (numbers can be comma-separated, space-separated, or "and" separated)
      // More flexible pattern: just numbers with commas/spaces/and, optionally followed by folder
      const numberPattern = /^[\d\s,]+(?:and\s*\d+)?(?:\s*-\s*on folder:\s*(.+))?$/i;
      const numberMatch = afterPrefix.match(numberPattern);
      
      if (numberMatch) {
        // Extract numbers part (before optional folder part)
        const numbersPart = afterPrefix.split(/\s*-\s*on folder:/i)[0].trim();
        const numbers = numbersPart
          .split(/[,\s]+|and\s+/i)
          .map(n => parseInt(n.trim(), 10))
          .filter(n => !isNaN(n) && n > 0);
        
        logger.info({ numbersPart, numbers }, 'Extracted numbers from shopping item deletion');
        
        if (numbers.length > 0) {
          const folderMatch = afterPrefix.match(/\s*-\s*on folder:\s*(.+)$/i);
          const parsed: ParsedAction = {
            action: 'delete',
            resourceType: 'shopping',
            itemNumbers: numbers,
            folderRoute: folderMatch ? folderMatch[1].trim() : undefined,
            missingFields: [],
          };
          logger.info({ parsed }, 'Returning parsed shopping item deletion with numbers');
          return parsed;
        }
      }
      
      // Regular name-based deletion (handle both singular and plural forms)
      const match = trimmed.match(/^Delete (a )?shopping items?:\s*(.+?)(?:\s*-\s*on folder:\s*(.+))?$/i);
      if (match) {
        taskName = match[2].trim();
        folderRoute = match[3]?.trim();
        logger.info({ taskName, folderRoute }, 'Parsed as name-based shopping item deletion');
      } else {
        logger.warn({ trimmed, afterPrefix }, 'Failed to parse shopping item deletion');
        missingFields.push('item name or folder');
      }
    } else if (trimmed.startsWith('Complete a shopping item:')) {
      action = 'complete';
      resourceType = 'shopping';
      const match = trimmed.match(/^Complete a shopping item:\s*(.+?)(?:\s*-\s*on folder:\s*(.+))?$/i);
      if (match) {
        taskName = match[1].trim();
        folderRoute = match[2]?.trim();
      } else {
        missingFields.push('item name or folder');
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
        
        // Check for category filter (birthdays, general, work, etc.)
        const reminderCategories = ['general', 'birthdays', 'once off', 'family & home', 'work and business', 'health and wellness', 'errands', 'travel', 'notes'];
        for (const part of filterParts) {
          const matchedCategory = reminderCategories.find(cat => 
            part === cat.toLowerCase() || 
            part.includes(cat.toLowerCase()) ||
            (cat === 'birthdays' && (part.includes('birthday') || part.includes('birth'))) ||
            (cat === 'work and business' && (part.includes('work') || part.includes('business'))) ||
            (cat === 'family & home' && (part.includes('family') || part.includes('home'))) ||
            (cat === 'health and wellness' && (part.includes('health') || part.includes('wellness')))
          );
          if (matchedCategory) {
            reminderCategory = matchedCategory;
            break;
          }
        }
        
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
        
        // Check for time-based filter (today, tomorrow, this week, next week, this month, next month)
        // Check longer phrases first to avoid partial matches
        const timeFilters = ['next month', 'this month', 'this week', 'next week', 'tomorrow', 'today'];
        for (const timeFilter of timeFilters) {
          if (filterText.includes(timeFilter)) {
            listFilter = timeFilter;
            break;
          }
        }
        
        // Also check for variations like "all reminders today" -> extract "today"
        if (!listFilter) {
          const todayMatch = filterText.match(/\b(today|tomorrow|this\s+week|this\s+month|next\s+week|next\s+month)\b/i);
          if (todayMatch && todayMatch[1]) {
            listFilter = todayMatch[1].toLowerCase();
          }
        }

        // CRITICAL: Check for specific dates FIRST (e.g., "3rd February", "27th January")
        // This must be checked before month-only filters to ensure specific dates are preserved
        if (!listFilter) {
          const extractedDate = this.parseSpecificDateFromText(filterText);
          if (extractedDate) {
            listFilter = extractedDate;
            logger.info({
              filterText,
              extractedDate,
            }, 'Extracted specific date from list filter');
          }
        }
        
        // If still no time filter, check for explicit month names ONLY (e.g., "march", "april")
        // This should only match if no specific date was found above
        if (!listFilter) {
          const monthName = this.extractMonthNameFromText(filterText, filterParts);
          if (monthName) {
            listFilter = monthName;
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
    } else if (trimmed.match(/^(Show|View|Get|See|Details? of|Overview of)\s+event(?!s)\s*(?:details?|overview|info|information)?/i) || 
               trimmed.match(/^(Show|View|Get|See)\s+(?:me\s+)?(?:the\s+)?(?:details?|overview|info|information)\s+(?:of|for)\s+event(?!s)/i) ||
               trimmed.match(/^(?:What|What's|Tell me about)\s+event(?!s)\s*(\d+)/i) ||
               trimmed.match(/^(?:Show|View|Get|See)\s+(?:me\s+)?event(?!s)\s*(\d+)/i) ||
               trimmed.match(/^Show\s+event\s+details:/i)) {
      // Detect event detail requests (SINGULAR "event" only - not "events" plural)
      // Use negative lookahead (?!s) to ensure we don't match "events" (plural)
      action = 'show';
      resourceType = 'event';
      
      // Check for "Show event details: [name]" format first
      const showEventDetailsMatch = trimmed.match(/^Show\s+event\s+details:\s*(.+)$/i);
      if (showEventDetailsMatch && showEventDetailsMatch[1]) {
        const extractedValue = showEventDetailsMatch[1].trim();
        // If it's just a number, keep it as-is (don't add "event" prefix)
        // This allows the showEventDetails method to properly detect it as a number
        if (/^\d+$/.test(extractedValue)) {
          taskName = extractedValue;
        } else {
          taskName = extractedValue;
        }
      } else {
        // Extract event number or name
        const eventNumberMatch = trimmed.match(/(?:event|#|number)\s*(\d+)/i) || trimmed.match(/^(\d+)$/);
        if (eventNumberMatch && eventNumberMatch[1]) {
          taskName = `event ${eventNumberMatch[1]}`;
        } else {
          // Extract event name/title
          const eventNameMatch = trimmed.match(/(?:event|details?|overview|info|information)\s+(?:of|for|about)?\s*["']?([^"']+)["']?/i) ||
                                trimmed.match(/(?:Show|View|Get|See)\s+(?:me\s+)?(?:the\s+)?(?:details?|overview|info|information)\s+(?:of|for)\s+["']?([^"']+)["']?/i);
          if (eventNameMatch && eventNameMatch[1]) {
            taskName = eventNameMatch[1].trim();
          } else {
            // Try to extract anything after common prefixes
            const afterPrefix = trimmed.replace(/^(Show|View|Get|See|Details? of|Overview of|What|What's|Tell me about)\s+(?:event|events?|me\s+the\s+details?\s+of|me\s+details?\s+of)\s*/i, '').trim();
            if (afterPrefix) {
              taskName = afterPrefix;
            } else {
              missingFields.push('event number or name');
            }
          }
        }
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
    } else if (trimmed.startsWith('Create a shopping list category:') || trimmed.startsWith('Create a shopping list sub-folder:')) {
      action = 'create_subfolder';
      resourceType = 'folder';
      isShoppingListFolder = true;
      const match = trimmed.match(/^Create a shopping list (?:category|sub-folder):\s*(.+?)\s*-\s*name:\s*(.+)$/i);
      if (match) {
        folderRoute = match[1].trim(); // parent folder
        newName = match[2].trim(); // category name
      } else {
        missingFields.push('parent folder or category name');
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
    } else if (trimmed.startsWith('Remove share:')) {
      action = 'unshare';
      // Parse: "Remove share: {recipient} - from: {resource_name|folder_route}"
      const match = trimmed.match(/^Remove share:\s*(.+?)\s*-\s*from:\s*(.+)$/i);
      if (match) {
        recipient = match[1].trim();
        const resourceName = match[2].trim();

        // Try to determine resource type based on context
        // Check if it's a folder route (common folder names or patterns)
        // For now, we'll try to resolve it as a folder first, then as a task/note
        folderRoute = resourceName;
        taskName = resourceName; // Also set as taskName for task/note resources
      } else {
        missingFields.push('recipient or resource name');
      }
    } else if (/^remove\s+(.+?)\s+from\s+(.+?)\s+share$/i.test(trimmed) ||
               /^remove\s+(.+?)\s+from\s+(.+)$/i.test(trimmed) ||
               /^unshare\s+(.+?)\s+with\s+(.+)$/i.test(trimmed) ||
               /^stop\s+sharing\s+(.+?)\s+with\s+(.+)$/i.test(trimmed)) {
      // Handle flexible unshare commands like:
      // "remove drala from groceries shopping list share"
      // "remove john from groceries"
      // "unshare groceries with drala"
      // "stop sharing groceries with john"
      action = 'unshare';

      let match;
      if ((match = trimmed.match(/^remove\s+(.+?)\s+from\s+(.+?)\s+share$/i))) {
        // "remove [person] from [resource] share"
        recipient = match[1].trim();
        folderRoute = match[2].trim();
        taskName = match[2].trim();
      } else if ((match = trimmed.match(/^remove\s+(.+?)\s+from\s+(.+)$/i))) {
        // "remove [person] from [resource]"
        recipient = match[1].trim();
        folderRoute = match[2].trim();
        taskName = match[2].trim();
      } else if ((match = trimmed.match(/^unshare\s+(.+?)\s+with\s+(.+)$/i))) {
        // "unshare [resource] with [person]"
        folderRoute = match[1].trim();
        taskName = match[1].trim();
        recipient = match[2].trim();
      } else if ((match = trimmed.match(/^stop\s+sharing\s+(.+?)\s+with\s+(.+)$/i))) {
        // "stop sharing [resource] with [person]"
        folderRoute = match[1].trim();
        taskName = match[1].trim();
        recipient = match[2].trim();
      }
    }

    // Validate required fields
    if (action === 'create' && resourceType === 'task' && !taskName) {
      missingFields.push('task name');
    }
    if (action === 'share' && !recipient) {
      missingFields.push('recipient');
    }
    if (action === 'unshare' && !recipient) {
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
        trimmed.startsWith('Create a shopping list category:') ||
        trimmed.startsWith('Create a shopping list sub-folder:') ||
        trimmed.startsWith('List shopping list folders:');
      
      isFriendFolder = trimmed.startsWith('Create a friend folder:') ||
        trimmed.startsWith('Edit a friend folder:') ||
        trimmed.startsWith('Delete a friend folder:') ||
        trimmed.startsWith('List friend folders:');
    }

    // Normalize recipient to remove indicator words (friends, contacts, group, guys, people)
    // and handle "everyone in [tag] [list/contact/folder]" patterns
    if (recipient) {
      recipient = this.normalizeRecipient(recipient);
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
      reminderCategory,
      missingFields,
      permission,
      category,
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
          if (parsed.resourceType === 'shopping') {
            return await this.listShoppingItems(parsed);
          } else if (parsed.resourceType === 'task') {
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
          if (parsed.resourceType === 'shopping') {
            return await this.editShoppingItem(parsed);
          } else if (parsed.resourceType === 'task') {
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
          if (parsed.resourceType === 'shopping') {
            return await this.deleteShoppingItem(parsed);
          } else if (parsed.resourceType === 'task') {
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
          if (parsed.resourceType === 'shopping') {
            return await this.completeShoppingItem(parsed);
          } else {
            return await this.completeTask(parsed);
          }
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
        case 'unshare':
          if (parsed.isShoppingListFolder) {
            return await this.unshareShoppingListFolder(parsed);
          } else if (parsed.resourceType === 'task') {
            return await this.unshareTask(parsed);
          } else if (parsed.resourceType === 'note') {
            return await this.unshareNote(parsed);
          } else if (parsed.resourceType === 'document') {
            return await this.unshareFile(parsed);
          } else {
            // For "Remove share:" commands, we need to determine the resource type
            // Try resolving as shopping list folder first
            if (parsed.folderRoute) {
              try {
                const shoppingListFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
                if (shoppingListFolderId) {
                  // It's a shopping list folder
                  return await this.unshareShoppingListFolder(parsed);
                }
              } catch (error) {
                // Not a shopping list folder, continue to try other types
              }
            }

            // Try resolving as task folder
            if (parsed.folderRoute) {
              try {
                const folderId = await this.resolveFolderRoute(parsed.folderRoute);
                if (folderId) {
                  // It's a task folder
                  return await this.unshareFolder(parsed);
                }
              } catch (error) {
                // Not a task folder, continue to try other types
              }
            }

            // Try resolving as task
            if (parsed.taskName) {
              try {
                const task = await this.resolveTask(parsed.taskName);
                if (task) {
                  // It's a task
                  return await this.unshareTask(parsed);
                }
              } catch (error) {
                // Not a task, continue to try other types
              }
            }

            // Try resolving as note
            if (parsed.taskName) {
              try {
                const note = await this.resolveNote(parsed.taskName);
                if (note) {
                  // It's a note
                  return await this.unshareNote(parsed);
                }
              } catch (error) {
                // Not a note, continue to try other types
              }
            }

            // Try resolving as file
            if (parsed.taskName) {
              try {
                const file = await this.resolveFile(parsed.taskName);
                if (file) {
                  // It's a file
                  return await this.unshareFile(parsed);
                }
              } catch (error) {
                // Not a file either
              }
            }

            // If we can't determine the type, return an error
            return {
              success: false,
              message: `I couldn't identify what "${parsed.folderRoute || parsed.taskName}" refers to. Please make sure it's a valid folder, task, note, or file name.`,
            };
          }
        case 'view':
          if (parsed.resourceType === 'document') {
            return await this.viewFile(parsed);
          } else if (parsed.resourceType === 'event') {
            return await this.showEventDetails(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to view.",
          };
        case 'show':
          if (parsed.resourceType === 'event') {
            return await this.showEventDetails(parsed);
          }
          return {
            success: false,
            message: "I'm sorry, I couldn't understand what you want to show.",
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
        message: `⚠️ *Shopping Item Updated:*\nNew: ${parsed.newName}`,
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
      let primaryFolder: any = null;
      let isPrimaryFolder = false;
      
      if (parsed.folderRoute) {
        folderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute) || undefined;
        if (parsed.folderRoute && !folderId) {
          return {
            success: false,
            message: `I couldn't find the shopping lists folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }
        // Check if the resolved folder is primary
        if (folderId) {
          primaryFolder = await getPrimaryShoppingListFolder(this.db, this.userId);
          isPrimaryFolder = primaryFolder?.id === folderId;
        }
      } else {
        // If no folder specified, use the primary folder
        primaryFolder = await getPrimaryShoppingListFolder(this.db, this.userId);
        if (primaryFolder) {
          folderId = primaryFolder.id;
          isPrimaryFolder = true;
          logger.info({ userId: this.userId, folderId: primaryFolder.id, folderName: primaryFolder.name }, 'Using primary shopping list folder for WhatsApp item');
        }
        // If no primary folder is set, folderId remains undefined (item goes to "All Items")
      }

      // Determine category: use extracted category if provided, otherwise use AI suggestion
      let category: string | undefined = parsed.category;
      
      if (!category) {
        // Use AI to suggest a category
        try {
          const categorySuggestion = await getCategorySuggestion(
            this.db,
            this.userId,
            parsed.taskName,
            undefined, // No description from WhatsApp
            folderId
          );
          
          if (categorySuggestion?.suggestedCategory) {
            category = categorySuggestion.suggestedCategory;
            logger.info({ 
              userId: this.userId, 
              itemName: parsed.taskName, 
              suggestedCategory: category,
              confidence: categorySuggestion.confidence 
            }, 'AI suggested category for shopping list item via WhatsApp');
          } else {
            logger.info({ userId: this.userId, itemName: parsed.taskName }, 'No category suggested by AI for shopping list item via WhatsApp');
          }
        } catch (error) {
          // Log error but continue without category
          logger.error(
            { error: error instanceof Error ? error.message : String(error), userId: this.userId, itemName: parsed.taskName },
            'Failed to get AI category suggestion for shopping list item via WhatsApp, creating without category'
          );
        }
      } else {
        logger.info({ userId: this.userId, itemName: parsed.taskName, category }, 'Using extracted category for shopping list item via WhatsApp');
      }

      await createShoppingListItem(this.db, {
        userId: this.userId,
        folderId,
        name: parsed.taskName,
        category,
        status: 'open',
      });

      // Determine the message format based on whether it's the primary folder
      let message: string;
      if (folderId) {
        if (isPrimaryFolder) {
          // Primary folder - present as Home List
          message = `✅ *Added to Home List:*\nItem/s: ${parsed.taskName}`;
        } else {
          // Not primary folder - include folder name, without the word "shopping"
          const folder = await getShoppingListFolderById(this.db, folderId, this.userId);
          const folderName = folder?.name || parsed.folderRoute || 'List';
          message = `✅ *Added to ${folderName} List:*\nItem/s: ${parsed.taskName}`;
        }
      } else {
        // No folder (goes to \"All Items\") - use Home List as the main list concept
        message = `✅ *Added to Home List:*\nItem/s: ${parsed.taskName}`;
      }

      return {
        success: true,
        message,
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

  private async unshareFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to remove from sharing. Please specify the recipient name.",
      };
    }

    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which folder you'd like to remove sharing from. Please specify the folder name.",
      };
    }

    try {
      // Check if it's a file folder first
      const fileFolderId = await this.resolveFileFolderRoute(parsed.folderRoute);
      if (fileFolderId) {
        const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
        if (!sharedWithUserId) {
          return {
            success: false,
            message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
          };
        }

        const shares = await getFileResourceShares(this.db, 'file_folder', fileFolderId, this.userId);
        const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

        if (!share) {
          return {
            success: false,
            message: `"${parsed.recipient}" is not currently shared on "${parsed.folderRoute}".`,
          };
        }

        await deleteFileShare(this.db, share.id, this.userId);

        return {
          success: true,
          message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.folderRoute}`,
        };
      }

      // Try task folder
      const folderId = await this.resolveFolderRoute(parsed.folderRoute);
      if (!folderId) {
        return {
          success: false,
          message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
        };
      }

      const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
      if (!sharedWithUserId) {
        return {
          success: false,
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
        };
      }

      const shares = await getResourceShares(this.db, 'task_folder', folderId, this.userId);
      const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

      if (!share) {
        return {
          success: false,
          message: `"${parsed.recipient}" is not currently shared on "${parsed.folderRoute}".`,
        };
      }

      await deleteTaskShare(this.db, share.id, this.userId);

      return {
        success: true,
        message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.folderRoute}`,
      };
    } catch (error) {
      logger.error(
        { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
        'Failed to remove share from folder'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't remove "${parsed.recipient}" from "${parsed.folderRoute}" sharing. Please try again.`,
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
      
      const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);
      if (sharedWithUserIds.length === 0) {
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
            message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
          };
        }
      }

      try {
        // Determine permission: use parsed permission if available, default to 'edit'
        const sharePermission = parsed.permission || 'edit';

        // Share with all resolved users
        const sharePromises = sharedWithUserIds.map(userId =>
          createFileShare(this.db, {
          resourceType: 'file_folder',
          resourceId: fileFolderId,
          ownerId: this.userId,
            sharedWithUserId: userId,
          permission: sharePermission,
          })
        );
        await Promise.all(sharePromises);

        const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
        const recipientText = sharedWithUserIds.length > 1 
          ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
          : parsed.recipient;
        
        return {
          success: true,
          message: `🔁 *File Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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
      const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);
      if (sharedWithUserIds.length === 0) {
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
            message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
          };
        }
      }

      try {
        // Determine permission: use parsed permission if available, default to 'edit'
        const sharePermission = parsed.permission || 'edit';

        // Share with all resolved users
        const sharePromises = sharedWithUserIds.map(userId =>
          createFileShare(this.db, {
          resourceType: 'file_folder',
          resourceId: fileFolderId,
          ownerId: this.userId,
            sharedWithUserId: userId,
          permission: sharePermission,
          })
        );
        await Promise.all(sharePromises);

        const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
        const recipientText = sharedWithUserIds.length > 1 
          ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
          : parsed.recipient;
        
        return {
          success: true,
          message: `🔁 *File Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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

    const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);
    if (sharedWithUserIds.length === 0) {
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
          message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      // Share with all resolved users
      const sharePromises = sharedWithUserIds.map(userId =>
        createTaskShare(this.db, {
        resourceType: 'task_folder',
        resourceId: folderId,
        ownerId: this.userId,
          sharedWithUserId: userId,
        permission: sharePermission,
        })
      );
      await Promise.all(sharePromises);

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      const recipientText = sharedWithUserIds.length > 1 
        ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
        : parsed.recipient;
      
      return {
        success: true,
        message: `🔁 *Task Folder Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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

  private async unshareShoppingListFolder(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to remove from sharing. Please specify the recipient name.",
      };
    }

    if (!parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which shopping list folder you'd like to remove sharing from. Please specify the folder name.",
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

      const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
      if (!sharedWithUserId) {
        return {
          success: false,
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
        };
      }

      // Get all shares for this folder
      const shares = await getResourceShares(this.db, 'shopping_list_folder', folderId, this.userId);
      const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

      if (!share) {
        return {
          success: false,
          message: `"${parsed.recipient}" is not currently shared on "${parsed.folderRoute}".`,
        };
      }

      await deleteTaskShare(this.db, share.id, this.userId);

      return {
        success: true,
        message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.folderRoute}`,
      };
    } catch (error) {
      logger.error(
        { error, folderRoute: parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
        'Failed to remove share from shopping list folder'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't remove "${parsed.recipient}" from "${parsed.folderRoute}" sharing. Please try again.`,
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

    const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);
    if (sharedWithUserIds.length === 0) {
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
          message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      // Share with all resolved users
      const sharePromises = sharedWithUserIds.map(userId =>
        createTaskShare(this.db, {
        resourceType: 'shopping_list_folder',
        resourceId: folderId,
        ownerId: this.userId,
          sharedWithUserId: userId,
        permission: sharePermission,
        })
      );
      await Promise.all(sharePromises);

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      const recipientText = sharedWithUserIds.length > 1 
        ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
        : parsed.recipient;
      
      return {
        success: true,
        message: `🔁 *Shopping List Shared*\nFolder: ${parsed.folderRoute}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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

  private async unshareTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to remove from sharing. Please specify the recipient name.",
      };
    }

    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to remove sharing from. Please specify the task name.",
      };
    }

    try {
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
        return {
          success: false,
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
        };
      }

      // Get all shares for this task
      const shares = await getResourceShares(this.db, 'task', task.id, this.userId);
      const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

      if (!share) {
        return {
          success: false,
          message: `"${parsed.recipient}" is not currently shared on "${parsed.taskName}".`,
        };
      }

      await deleteTaskShare(this.db, share.id, this.userId);

      return {
        success: true,
        message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.taskName}`,
      };
    } catch (error) {
      logger.error(
        { error, taskName: parsed.taskName, recipient: parsed.recipient, userId: this.userId },
        'Failed to remove share from task'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't remove "${parsed.recipient}" from "${parsed.taskName}" sharing. Please try again.`,
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

    const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);
    if (sharedWithUserIds.length === 0) {
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
          message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      // Share with all resolved users
      const sharePromises = sharedWithUserIds.map(userId =>
        createTaskShare(this.db, {
        resourceType: 'task',
        resourceId: task.id,
        ownerId: this.userId,
          sharedWithUserId: userId,
        permission: sharePermission,
        })
      );
      await Promise.all(sharePromises);

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      const recipientText = sharedWithUserIds.length > 1 
        ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
        : parsed.recipient;
      
      return {
        success: true,
        message: `🔁 *Task Shared*\nTitle: ${parsed.taskName}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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

  private async deleteShoppingItem(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    logger.info({ 
      itemNumbers: parsed.itemNumbers, 
      taskName: parsed.taskName, 
      folderRoute: parsed.folderRoute,
      userId: this.userId 
    }, 'deleteShoppingItem called');
    
    // Check if this is number-based deletion
    if (parsed.itemNumbers && parsed.itemNumbers.length > 0) {
      const context = this.getListContext();
      if (!context || context.type !== 'shopping') {
        return {
          success: false,
          message: "I don't have a recent shopping list to reference. Please list your shopping items first, then delete by number.",
        };
      }

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
        // Format multiple items
        const itemsText = deletedNames.length === 1
          ? `Title: ${deletedNames[0]}`
          : deletedNames.map(name => `Title: ${name}`).join('\n');
        return {
          success: true,
          message: `⛔ *Item Removed:*\n${itemsText}${errors.length > 0 ? `\n\nFailed to delete: ${errors.join(', ')}` : ''}`,
        };
      } else {
        return {
          success: false,
          message: `I couldn't delete the items. Please try again.`,
        };
      }
    }

    // Fallback to name-based deletion
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which item you'd like to delete. Please specify the item name or number.",
      };
    }

    // Resolve folder if specified
    let folderId: string | undefined = undefined;
    if (parsed.folderRoute) {
      const resolvedFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
      folderId = resolvedFolderId || undefined;
    }

    const items = await getUserShoppingListItems(this.db, this.userId, { folderId });
    const item = items.find((i) => i.name.toLowerCase() === parsed.taskName!.toLowerCase());
    
    if (!item) {
      const folderText = parsed.folderRoute ? ` in "${parsed.folderRoute}"` : '';
      return {
        success: false,
        message: `I couldn't find the item "${parsed.taskName}"${folderText}. Please make sure the item exists.`,
      };
    }

    try {
      await deleteShoppingListItem(this.db, item.id, this.userId);
      return {
        success: true,
        message: `⛔ *Item Removed:*\nTitle: ${item.name}`,
      };
    } catch (error) {
      logger.error({ error, itemId: item.id, userId: this.userId }, 'Failed to delete shopping list item');
      return {
        success: false,
        message: `I'm sorry, I couldn't delete the item "${parsed.taskName}". Please try again.`,
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

  private async completeShoppingItem(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which item you'd like to complete. Please specify the item name.",
      };
    }

    // Resolve folder if specified
    let folderId: string | undefined = undefined;
    if (parsed.folderRoute) {
      const resolvedFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
      folderId = resolvedFolderId || undefined;
    }

    let items = await getUserShoppingListItems(this.db, this.userId, { folderId });
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
          ? `✅ *Item Purchased:*\n${item.name}`
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

  private async completeTask(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which task you'd like to complete. Please specify the task name.",
      };
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
          message: `⚠️ *File Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
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
          message: `⚠️ *File Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
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
        message: `⚠️ *Folder Renamed Successfully*\n   "${parsed.folderRoute}" to "${parsed.newName}"`,
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
          message: `⛔ *File Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
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
          message: `⛔ *File Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
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
        message: `⛔ *Folder Deleted Successfully*\n   "${parsed.folderRoute}"`,
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
        message: `⚠️ *File updated:*\n"${parsed.newName === 'unspecified' ? parsed.taskName : parsed.newName}"`,
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

  private async unshareFile(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to remove from sharing. Please specify the recipient name.",
      };
    }

    if (!parsed.taskName) {
      return {
        success: false,
        message: "I need to know which file you'd like to remove sharing from. Please specify the file name.",
      };
    }

    try {
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

      const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
      if (!sharedWithUserId) {
        return {
          success: false,
          message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
        };
      }

      const shares = await getFileResourceShares(this.db, 'file', file.id, this.userId);
      const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

      if (!share) {
        return {
          success: false,
          message: `"${parsed.recipient}" is not currently shared on "${parsed.taskName}".`,
        };
      }

      await deleteFileShare(this.db, share.id, this.userId);

      return {
        success: true,
        message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.taskName}`,
      };
    } catch (error) {
      logger.error(
        { error, fileName: parsed.taskName, recipient: parsed.recipient, userId: this.userId },
        'Failed to remove share from file'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't remove "${parsed.recipient}" from "${parsed.taskName}" sharing. Please try again.`,
      };
    }
  }

  private async unshareNote(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    if (!parsed.recipient) {
      return {
        success: false,
        message: "I need to know who you'd like to remove from sharing. Please specify the recipient name.",
      };
    }

    if (!parsed.taskName && !parsed.folderRoute) {
      return {
        success: false,
        message: "I need to know which note or folder you'd like to remove sharing from. Please specify the name.",
      };
    }

    try {
      // Try to find as note first
      if (parsed.taskName) {
        const note = await this.findNoteByName(parsed.taskName, parsed.folderRoute);
        if (note) {
          const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
          if (!sharedWithUserId) {
            return {
              success: false,
              message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
            };
          }

          const shares = await getNoteResourceShares(this.db, 'note', note.id, this.userId);
          const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

          if (!share) {
            return {
              success: false,
              message: `"${parsed.recipient}" is not currently shared on "${parsed.taskName}".`,
            };
          }

          await deleteNoteShare(this.db, share.id, this.userId);

          return {
            success: true,
            message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.taskName}`,
          };
        }
      }

      // Try as folder
      if (parsed.folderRoute) {
        const noteFolder = await this.findNoteFolderByName(parsed.folderRoute);
        if (noteFolder) {
          const sharedWithUserId = await this.resolveRecipient(parsed.recipient);
          if (!sharedWithUserId) {
            return {
              success: false,
              message: `I couldn't find a user or friend with "${parsed.recipient}". Please check the name and try again.`,
            };
          }

          const shares = await getNoteResourceShares(this.db, 'note_folder', noteFolder.id, this.userId);
          const share = shares.find(s => s.sharedWithUserId === sharedWithUserId);

          if (!share) {
            return {
              success: false,
              message: `"${parsed.recipient}" is not currently shared on "${parsed.folderRoute}".`,
            };
          }

          await deleteNoteShare(this.db, share.id, this.userId);

          return {
            success: true,
            message: `🔁 *Share Removed*\nRemoved: ${parsed.recipient}\nFrom: ${parsed.folderRoute}`,
          };
        }
      }

      return {
        success: false,
        message: `I couldn't find the note or folder "${parsed.taskName || parsed.folderRoute}". Please make sure it exists.`,
      };
    } catch (error) {
      logger.error(
        { error, resourceName: parsed.taskName || parsed.folderRoute, recipient: parsed.recipient, userId: this.userId },
        'Failed to remove share from note'
      );
      return {
        success: false,
        message: `I'm sorry, I couldn't remove "${parsed.recipient}" from "${parsed.taskName || parsed.folderRoute}" sharing. Please try again.`,
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

    // Try to find user by email, phone, friend name, or tag
    // The searchUsersForFileSharing function now includes friend name search
    const sharedWithUserIds = await this.resolveRecipients(parsed.recipient);

    if (sharedWithUserIds.length === 0) {
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
          message: `I couldn't find a user, friend, or tag with "${parsed.recipient}". Please provide the recipient's email address, phone number, friend name, or tag (e.g., "john@example.com", "+27123456789", "John Doe", or "Family").`,
        };
      }
    }

    try {
      // Determine permission: use parsed permission if available, default to 'edit'
      const sharePermission = parsed.permission || 'edit';

      // Share with all resolved users
      const sharePromises = sharedWithUserIds.map(userId =>
        createFileShare(this.db, {
        resourceType: 'file',
        resourceId: file.id,
        ownerId: this.userId,
          sharedWithUserId: userId,
        permission: sharePermission,
        })
      );
      await Promise.all(sharePromises);

      const permissionLabel = sharePermission === 'edit' ? 'Editor' : 'View';
      const recipientText = sharedWithUserIds.length > 1 
        ? `${sharedWithUserIds.length} people (${parsed.recipient} tag)`
        : parsed.recipient;
      
      return {
        success: true,
        message: `🔁 *File Shared*\nFile: ${parsed.taskName}\nShare to: ${recipientText}\nPermission: ${permissionLabel}`,
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

  private async listShoppingItems(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const statusFilter = parsed.status && parsed.status !== 'all' ? parsed.status as 'open' | 'completed' : undefined;
      
      // Resolve folder if specified
      let folderId: string | undefined = undefined;
      let folderName: string | undefined = undefined;
      let isPrimaryFolder = false;

      const folderRouteLower = parsed.folderRoute?.toLowerCase();

      if (parsed.folderRoute && folderRouteLower !== 'all') {
        // Specific list requested (e.g. "grocery list", "Groceries")
        const resolvedFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
        folderId = resolvedFolderId || undefined;
        if (!folderId) {
          return {
            success: false,
            message: `I couldn't find the lists folder "${parsed.folderRoute}". Please make sure the list exists.`,
          };
        }
        // Get the actual folder name from the database and check if it's primary
        const folder = await getShoppingListFolderById(this.db, folderId, this.userId);
        folderName = folder?.name;
        const primaryFolder = await getPrimaryShoppingListFolder(this.db, this.userId);
        isPrimaryFolder = primaryFolder?.id === folderId;
      } else if (!parsed.folderRoute) {
        // No folder name mentioned -> show primary (Home) list
        const primaryFolder = await getPrimaryShoppingListFolder(this.db, this.userId);
        if (primaryFolder) {
          folderId = primaryFolder.id;
          folderName = primaryFolder.name;
          isPrimaryFolder = true;
        }
      } else if (folderRouteLower === 'all') {
        // Explicitly asked for "all" -> do NOT filter by folderId (show items from all lists)
        folderId = undefined;
        folderName = 'All';
        isPrimaryFolder = false;
      }

      const items = await getUserShoppingListItems(this.db, this.userId, {
        folderId,
        status: statusFilter,
      });

      if (items.length === 0) {
        const statusText = statusFilter ? ` (${statusFilter})` : '';
        const listLabel =
          folderRouteLower === 'all'
            ? 'All Items'
            : isPrimaryFolder || !folderName
            ? 'Home'
            : folderName;
        return {
          success: true,
          message: `🛒 *Your ${listLabel} List is empty${statusText}*`,
        };
      }
      const statusText = statusFilter ? ` (${statusFilter})` : '';
      const listLabel =
        folderRouteLower === 'all'
          ? 'All Items'
          : isPrimaryFolder || !folderName
          ? 'Home'
          : folderName;
      let message = `🛍️ *${listLabel} List${statusText}:*\n`;

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
    } catch (error) {
      logger.error({ error, userId: this.userId, folderRoute: parsed.folderRoute }, 'Failed to list shopping items');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve your shopping list. Please try again.",
      };
    }
  }

  private async listTasks(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      // Handle regular tasks only (shopping lists are handled separately)
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
   * Convert a date to the user's timezone and return a Date object representing that local time
   * @param date - The date to convert
   * @param timezone - The user's timezone (e.g., 'Africa/Johannesburg')
   * @returns A Date object representing the date in the user's timezone
   */
  private convertDateToUserTimezone(date: Date, timezone: string): Date {
    const dateStr = date.toLocaleString("en-US", { timeZone: timezone });
    return new Date(dateStr);
  }

  /**
   * Extract date components (year, month, day) from a date in the user's timezone
   * @param date - The date to extract components from
   * @param timezone - The user's timezone
   * @returns An object with year, month (0-based), and day
   */
  private getDateComponentsInTimezone(date: Date, timezone: string): { year: number; month: number; day: number } {
    const dateInTz = this.convertDateToUserTimezone(date, timezone);
    return {
      year: dateInTz.getFullYear(),
      month: dateInTz.getMonth(),
      day: dateInTz.getDate(),
    };
  }

  /**
   * Check if two dates fall on the same calendar day in the user's timezone
   * @param date1 - First date to compare
   * @param date2 - Second date to compare
   * @param timezone - The user's timezone
   * @returns True if both dates are on the same day
   */
  private isSameCalendarDay(date1: Date, date2: Date, timezone: string): boolean {
    const components1 = this.getDateComponentsInTimezone(date1, timezone);
    const components2 = this.getDateComponentsInTimezone(date2, timezone);
    
    return (
      components1.year === components2.year &&
      components1.month === components2.month &&
      components1.day === components2.day
    );
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
          const targetInTz = timezone 
            ? this.convertDateToUserTimezone(target, timezone)
            : new Date(target);
          
          const targetComponents = timezone
            ? this.getDateComponentsInTimezone(target, timezone)
            : { year: targetInTz.getFullYear(), month: targetInTz.getMonth(), day: targetInTz.getDate() };
          
          // Compare: month is 1-based in the switch statement, but 0-based in getDateComponentsInTimezone
          return (
            targetComponents.year === year &&
            targetComponents.month + 1 === month &&
            targetComponents.day === day
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
    try {
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
          
          // Normalize times to start of day for accurate comparison
          const targetNormalized = new Date(targetInTz);
          targetNormalized.setHours(0, 0, 0, 0);
          const startNormalized = new Date(startInTz);
          startNormalized.setHours(0, 0, 0, 0);
          const endNormalized = new Date(endInTz);
          endNormalized.setHours(23, 59, 59, 999);
          
          // Check if target date is within range
          return targetNormalized >= startNormalized && targetNormalized <= endNormalized;
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
        
        // For monthly reminders, we need to check only months that fall within the date range
        // Use the already-defined startYear, startMonth, endYear, endMonth from the top of the function
        
        // Iterate through each month in the range
        for (let year = startYear; year <= endYear; year++) {
          const monthStart = year === startYear ? startMonth : 1;
          const monthEnd = year === endYear ? endMonth : 12;
          
          for (let month = monthStart; month <= monthEnd; month++) {
            // Check if the reminder day in this month falls within the range
          const lastDayOfMonth = new Date(year, month, 0).getDate();
          const targetDay = Math.min(reminderDay, lastDayOfMonth);
          
            // Create target date and convert to user's timezone for comparison
            const targetDateLocal = new Date(year, month - 1, targetDay);
            targetDateLocal.setHours(0, 0, 0, 0);
            
            // Convert to user's timezone if provided
            let targetDateInTz: Date;
            if (timezone) {
              const targetStr = targetDateLocal.toLocaleString("en-US", { timeZone: timezone });
              targetDateInTz = new Date(targetStr);
            } else {
              targetDateInTz = new Date(targetDateLocal);
            }
            targetDateInTz.setHours(0, 0, 0, 0);
            
            // Check if this month's target day is within the range
            if (targetDateInTz >= startInTz && targetDateInTz <= endInTz) {
            return true;
          }
          }
        }
        return false;
        
      case "yearly":
        // Check if any date in the range matches the month and day
        const reminderMonth = reminder.month ?? 1;
        const reminderDayOfMonth = reminder.dayOfMonth ?? 1;
        
        // For yearly reminders, compare month/day components directly to avoid timezone issues
        // Check if the reminder's month/day falls within the date range
        // We need to check all years in the range, but compare by month/day components
        
        // If range spans multiple years, check each year
        for (let year = startYear; year <= endYear; year++) {
          // Check if this year's occurrence falls within the range
          // Compare by month/day components, not full dates
          
          // If reminder month is before start month, or after end month, skip this year
          if (year === startYear && reminderMonth < startMonth) continue;
          if (year === endYear && reminderMonth > endMonth) continue;
          
          // If same month as start, check day
          if (year === startYear && reminderMonth === startMonth) {
            if (reminderDayOfMonth < startDay) continue;
          }
          
          // If same month as end, check day
          if (year === endYear && reminderMonth === endMonth) {
            if (reminderDayOfMonth > endDay) continue;
          }
          
          // If we get here, the reminder falls within the range
          return true;
        }
        return false;
        
      default:
        return false;
    }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id, userId: this.userId }, 'Error in canReminderOccurInRange');
        return false;
    }
  }

  private async listReminders(parsed: ParsedAction, userTimezone?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Ensure userTimezone is available - fetch from database if not provided
      if (!userTimezone) {
        const user = await getUserById(this.db, this.userId);
        userTimezone = (user as any)?.timezone;
        if (!userTimezone) {
          // Default to UTC if no timezone is set
          userTimezone = 'UTC';
        }
      }
      
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
      
      // Filter by category if specified
      if (parsed.reminderCategory) {
        const categoryMap: Record<string, string> = {
          'birthdays': 'Birthdays',
          'general': 'General',
          'once off': 'Once off',
          'family & home': 'Family & Home',
          'work and business': 'Work and Business',
          'health and wellness': 'Health and Wellness',
          'errands': 'Errands',
          'travel': 'Travel',
          'notes': 'Notes',
        };
        const normalizedCategory = categoryMap[parsed.reminderCategory.toLowerCase()] || parsed.reminderCategory;
        filteredReminders = filteredReminders.filter(r => r.category === normalizedCategory);
      }

      // Filter by time if specified (today, tomorrow, this week, this month)
      // Calculate date ranges based on user's timezone (not server timezone)
      // Declare dateFilterRange outside the if block so it's accessible later
      // Note: userTimezone is now guaranteed to be defined (set above)
      let dateFilterRange: { start: Date; end: Date } | null = null;
      
      if (parsed.listFilter) {
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
        
        // FIRST: Check for specific date with day and month (e.g., "27th January", "27 January", "January 27th")
        const currentYear = now.getFullYear();
        const specificDate = this.parseSpecificDateComponents(timeFilter, currentYear);
        
        if (specificDate) {
          logger.info({
            userId: this.userId,
            originalFilter: timeFilter,
            specificDate,
          }, 'Parsed specific date from reminder filter');
        }
        
        // Extract month name from filter - handle cases like "october - category: birthdays"
        // Only do this if we didn't find a specific date
        let extractedMonth: string | null = null;
        if (!specificDate) {
          for (const month of ActionExecutor.MONTH_NAMES) {
            // Match month at the start of the string, optionally followed by space, dash, or end of string
            const monthMatch = timeFilter.match(new RegExp(`^(${month})(?:\\s|\\s*-|$)`, 'i'));
            if (monthMatch) {
              extractedMonth = month;
              break;
            }
          }
        }
        const monthIndexFromFilter = extractedMonth ? ActionExecutor.MONTH_NAMES.indexOf(extractedMonth) : -1;

        if (specificDate) {
          // Specific date requested (e.g., "27th January")
          // Create date in user's timezone to ensure correct date matching
          const PADDED_MONTH = String(specificDate.month + 1).padStart(2, '0');
          const PADDED_DAY = String(specificDate.day).padStart(2, '0');
          
          const targetDateStr = `${specificDate.year}${ActionExecutor.DATE_SEPARATOR}${PADDED_MONTH}${ActionExecutor.DATE_SEPARATOR}${PADDED_DAY}${ActionExecutor.TIME_SEPARATOR}${ActionExecutor.MIDNIGHT_TIME}`;
          const tempDate = new Date(targetDateStr);
          const targetDateInTz = this.convertDateToUserTimezone(tempDate, userTimezone);
          
          dateFilterRange = {
            start: startOfDay(targetDateInTz),
            end: endOfDay(targetDateInTz),
          };
          
          // Mark this as a specific date filter for proper filtering logic
          (dateFilterRange as any).isSpecificDate = true;
          
          logger.info({
            userId: this.userId,
            specificDate,
            targetDateStr,
            targetDateInTz: targetDateInTz.toISOString(),
            dateRange: {
              start: dateFilterRange.start.toISOString(),
              end: dateFilterRange.end.toISOString(),
            },
            userTimezone,
          }, 'Created date range for specific date filter');
        } else if (timeFilter === 'today' || timeFilter.includes('today')) {
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
        } else {
          // Check for day-of-week filters (e.g., "this Thursday", "Thursday", "this Monday")
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          let targetDayIndex: number | null = null;
          let isThisWeek = false;
          
          // Check for "this [day]" pattern (e.g., "this thursday", "this monday")
          for (let i = 0; i < dayNames.length; i++) {
            const dayName = dayNames[i];
            const thisDayPattern = new RegExp(`this\\s+${dayName}`, 'i');
            if (thisDayPattern.test(timeFilter)) {
              targetDayIndex = i;
              isThisWeek = true;
              break;
            }
          }
          
          // If not found, check for just day name (e.g., "thursday", "monday")
          if (targetDayIndex === null) {
            for (let i = 0; i < dayNames.length; i++) {
              const dayName = dayNames[i];
              // Match day name as whole word, not part of another word
              const dayPattern = new RegExp(`\\b${dayName}\\b`, 'i');
              if (dayPattern.test(timeFilter) && !timeFilter.includes('week') && !timeFilter.includes('month')) {
                targetDayIndex = i;
                break;
              }
            }
          }
          
          if (targetDayIndex !== null) {
            // Calculate the target date for the specified day
            const currentDayOfWeek = userNow.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
            let daysToAdd: number;
            
            if (isThisWeek) {
              // "this [day]" means the next occurrence of that day in the current week
              // If today is that day, use today; otherwise find the next occurrence this week
              if (currentDayOfWeek === targetDayIndex) {
                daysToAdd = 0; // Today is the target day
              } else if (currentDayOfWeek < targetDayIndex) {
                daysToAdd = targetDayIndex - currentDayOfWeek; // This week
              } else {
                // Day has passed this week, use next week
                daysToAdd = 7 - (currentDayOfWeek - targetDayIndex);
              }
            } else {
              // Just "[day]" means the next occurrence of that day
              if (currentDayOfWeek === targetDayIndex) {
                daysToAdd = 0; // Today is the target day
              } else if (currentDayOfWeek < targetDayIndex) {
                daysToAdd = targetDayIndex - currentDayOfWeek; // This week
              } else {
                // Day has passed, use next week
                daysToAdd = 7 - (currentDayOfWeek - targetDayIndex);
              }
            }
            
            const targetDate = addDays(userNow, daysToAdd);
            dateFilterRange = {
              start: startOfDay(targetDate),
              end: endOfDay(targetDate),
            };
            
            // Store the day-of-week info for later use in filtering and title formatting
            (dateFilterRange as any).isDayOfWeek = true;
            (dateFilterRange as any).targetDayName = dayNames[targetDayIndex];
            (dateFilterRange as any).isThisWeek = isThisWeek;
            
            logger.info({
              userId: this.userId,
              timeFilter,
              targetDayIndex,
              targetDayName: dayNames[targetDayIndex],
              currentDayOfWeek,
              currentDayName: dayNames[currentDayOfWeek],
              daysToAdd,
              isThisWeek,
              targetDate: targetDate.toISOString(),
              dateRange: {
                start: dateFilterRange.start.toISOString(),
                end: dateFilterRange.end.toISOString(),
              },
              userTimezone,
            }, 'Created date range for day-of-week filter');
          }
        }
        
        // CRITICAL: Only create month/week ranges if we don't already have a dateFilterRange
        // This prevents month extraction from overriding specific date filters
        if (!dateFilterRange && !specificDate) {
          // Check for week/month filters if no day-of-week match found
          // IMPORTANT: Don't override if we already have a specific date filter
          if (timeFilter.includes('this week') || (timeFilter.includes('week') && !timeFilter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i))) {
          dateFilterRange = {
            start: startOfWeek(userNow, { weekStartsOn: 1 }), // Monday
            end: endOfWeek(userNow, { weekStartsOn: 1 }),
          };
          } else if (monthIndexFromFilter !== -1 && !specificDate) {
          // Specific month requested (e.g., "april", "may", "october")
          // IMPORTANT: Only do this if we don't have a specific date (e.g., "27th January" should not trigger this)
          const currentYear = userNow.getFullYear();
          const currentMonth = userNow.getMonth(); // 0-based
          const targetMonth = monthIndexFromFilter; // 0-based
          const targetYear = targetMonth < currentMonth ? currentYear + 1 : currentYear;
          
          // Create date range for the specific month
          // Use date-fns functions which handle timezones correctly
          const monthDate = new Date(targetYear, targetMonth, 1);
          const start = startOfMonth(monthDate);
          const end = endOfMonth(monthDate);
          
          dateFilterRange = { start, end };
          
          logger.info({
            userId: this.userId,
            targetMonth: targetMonth + 1, // 1-based for logging
            targetYear,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            userTimezone,
            specificDate,
          }, 'Created date range for specific month filter');
        } else if (timeFilter.includes('this month')) {
          dateFilterRange = {
            start: startOfMonth(userNow),
            end: endOfMonth(userNow),
          };
        } else if (timeFilter.includes('next month')) {
          const nextMonthDate = addMonths(userNow, 1);
          dateFilterRange = {
            start: startOfMonth(nextMonthDate),
            end: endOfMonth(nextMonthDate),
          };
        } else if (timeFilter.includes('next week')) {
          const nextWeekStart = addDays(startOfWeek(userNow, { weekStartsOn: 1 }), 7);
          dateFilterRange = {
            start: startOfDay(nextWeekStart),
            end: endOfDay(endOfWeek(nextWeekStart, { weekStartsOn: 1 })),
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
          // Special case: "today", specific dates, and day-of-week dates should use exact scheduled date logic
          // to avoid edge cases with yearly/birthday reminders and timezones.
          const isDayOfWeekFilter = (dateFilterRange as any).isDayOfWeek === true;
          const isSpecificDateFilter = (dateFilterRange as any).isSpecificDate === true;
          
          // CRITICAL: Check if we have a specific date - this must be checked first
          // If specificDate is set OR isSpecificDateFilter is true, we MUST use exact date matching
          const hasSpecificDate = specificDate !== null || isSpecificDateFilter;
          
          // Log for debugging
          logger.info({
            userId: this.userId,
            timeFilter,
            specificDate,
            hasSpecificDate,
            isSpecificDateFilter,
            isDayOfWeekFilter,
            dateFilterRangeStart: dateFilterRange.start.toISOString(),
            dateFilterRangeEnd: dateFilterRange.end.toISOString(),
            willUseExactDateMatch: timeFilter === 'today' || hasSpecificDate || isDayOfWeekFilter,
          }, 'Checking filter type for reminder filtering');
          
          // CRITICAL: Use exact date matching for specific dates, today, and day-of-week filters
          // This ensures we only show reminders that can occur on that exact date
          if (timeFilter === 'today' || hasSpecificDate || isDayOfWeekFilter) {
            // For specific dates, we'll filter later using calculateReminderTimeOnDate
            // For "today" and day-of-week, use the existing isReminderScheduledForDate filter
            if (!hasSpecificDate) {
              // For "today" and day-of-week filters, use the existing filter logic
              let targetDate: Date;
              if (isDayOfWeekFilter) {
                targetDate = new Date(dateFilterRange.start);
              } else {
                const userTimeString = now.toLocaleString("en-US", { timeZone: userTimezone });
                targetDate = new Date(userTimeString);
              }
              
              // Convert targetDate to user's timezone for accurate date component extraction
              const targetDateInTz = this.convertDateToUserTimezone(targetDate, userTimezone);
              const dateComponents = this.getDateComponentsInTimezone(targetDate, userTimezone);
              const userLocalTime = {
                year: dateComponents.year,
                month: dateComponents.month,
                day: dateComponents.day,
                hours: 0,
                minutes: 0,
                seconds: 0,
                date: targetDateInTz,
              };

              filteredReminders = filteredReminders.filter(reminder => {
                const isScheduledForDate = this.isReminderScheduledForDate(reminder, userLocalTime, userTimezone);

                if (!isScheduledForDate) {
                  logger.debug({
                    reminderId: reminder.id,
                    reminderTitle: reminder.title,
                    frequency: reminder.frequency,
                    active: reminder.active,
                    targetDate: `${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
                    reason: 'Reminder not scheduled for target date',
                  }, 'Reminder filtered out by exact date check');
                }

                return isScheduledForDate;
              });
            }
            // For specific date filters, we'll filter in the nextTime calculation step
            // This ensures we use calculateReminderTimeOnDate which is more precise
            
            if (hasSpecificDate) {
              logger.info({
                userId: this.userId,
                timeFilter,
                specificDate,
                hasSpecificDate,
                note: 'Specific date filter - will filter in nextTime calculation step',
                reminderCount: filteredReminders.length,
              }, 'Skipping initial filter for specific date - will use calculateReminderTimeOnDate');
            } else {
              logger.info({
                userId: this.userId,
                timeFilter,
                targetDate: `${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
                filteredCount: filteredReminders.length,
                filteredReminderTitles: filteredReminders.map(r => r.title),
              }, 'Filtered reminders by exact date check');
            }
          } else {
            // For other ranges (tomorrow, this week, this month, next week),
            // use the same range-based logic as the reminders page.
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
          }
          
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
        // Format filter name for title - use the same logic as below
        let filterTitle = 'Reminders';
        if (parsed.listFilter) {
          const filter = parsed.listFilter.toLowerCase();
          if (filter === 'today') filterTitle = "Today's Reminders";
          else if (filter === 'tomorrow') filterTitle = "Tomorrow's Reminders";
          else if (filter.includes('next week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) filterTitle = "Next Week's Reminders";
          else if (filter.includes('this week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) filterTitle = "This Week's Reminders";
          else if (filter.includes('week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) filterTitle = "This Week's Reminders";
          else if (filter.includes('next month')) filterTitle = "Next Month's Reminders";
          else if (filter.includes('this month')) filterTitle = "This Month's Reminders";
          else if (filter.includes('month')) filterTitle = "This Month's Reminders";
          else {
            // Check for day-of-week filters (e.g., "this Thursday", "Thursday")
            let dayOfWeekFound = false;
            
            for (let i = 0; i < ActionExecutor.DAY_NAMES.length; i++) {
              const dayName = ActionExecutor.DAY_NAMES[i];
              // Check for "this [day]" pattern
              if (filter.match(new RegExp(`this\\s+${dayName}`, 'i'))) {
                filterTitle = `Reminders for this ${ActionExecutor.CAPITALIZED_DAYS[i]}`;
                dayOfWeekFound = true;
                break;
              }
              // Check for just day name
              if (filter.match(new RegExp(`\\b${dayName}\\b`, 'i')) && !filter.includes('week') && !filter.includes('month')) {
                filterTitle = `Reminders for ${ActionExecutor.CAPITALIZED_DAYS[i]}`;
                dayOfWeekFound = true;
                break;
              }
            }
            
            if (!dayOfWeekFound) {
            // Check if it's a specific date (e.g., "27th January")
            // Use helper method to parse specific date
            const extractedDate = this.parseSpecificDateFromText(filter);
            if (extractedDate) {
              // Parse the date to get components for formatting
              const now = new Date();
              const currentYear = now.getFullYear();
              const dateComponents = this.parseSpecificDateComponents(extractedDate, currentYear);
              
              if (dateComponents) {
                const dayNum = dateComponents.day;
                const daySuffix = dayNum === 1 ? 'st' : dayNum === 2 ? 'nd' : dayNum === 3 ? 'rd' : 'th';
                const monthName = ActionExecutor.CAPITALIZED_MONTHS[dateComponents.month];
                
                // Determine format based on original match pattern
                const isDayFirst = /^\d/.test(extractedDate);
                if (isDayFirst) {
                  filterTitle = `Reminders for ${dayNum}${daySuffix} ${monthName}`;
                } else {
                  filterTitle = `Reminders for ${monthName} ${dayNum}${daySuffix}`;
                }
                specificDateFound = true;
              }
            }
            
            if (!specificDateFound) {
              // Check if it's just a month name and capitalize it
              const monthIndex = ActionExecutor.MONTH_NAMES.findIndex(m => {
                // Extract just the month part if there's additional text
                const monthMatch = filter.match(new RegExp(`^(${m})(?:\\s|\\s*-|$)`, 'i'));
                return monthMatch !== null;
              });
              if (monthIndex !== -1) {
                filterTitle = `Reminders for ${this.getCapitalizedMonthName(monthIndex)}`;
              } else {
                // Capitalize first letter of other filters
                const capitalized = parsed.listFilter.charAt(0).toUpperCase() + parsed.listFilter.slice(1).toLowerCase();
                filterTitle = `Reminders for ${capitalized}`;
              }
            }
          }
          }
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
        
        // Check if we're filtering by a specific date (e.g., "27th January")
        // This MUST be checked FIRST to ensure specific dates take precedence over month-only filters
        const isSpecificDateFilter = dateFilterRange && (dateFilterRange as any).isSpecificDate === true;
        
        // Check if we're filtering by a specific month (ONLY if not a specific date filter)
        // This regex matches month names at the start of the string, so "3 Feb" won't match
        const isSpecificMonthFilter = !isSpecificDateFilter && dateFilterRange && 
          parsed.listFilter && 
          /^(january|february|march|april|may|june|july|august|september|october|november|december)/i.test(parsed.listFilter);
        
        remindersWithNextTime = filteredReminders.map(reminder => {
          let nextTime: Date | null = null;
          
          if (isSpecificDateFilter && dateFilterRange) {
            // For specific date filters, calculate the occurrence ON that exact date
            // Use calculateReminderTimeOnDate instead of calculateNextReminderTime
            // to ensure we get the time on the target date, not the next occurrence
            const targetDate = new Date(dateFilterRange.start);
            nextTime = this.calculateReminderTimeOnDate(reminder, targetDate, userTimezone);
            
            // CRITICAL: Verify that nextTime is actually on the target date
            if (nextTime) {
              const isOnTargetDate = this.isSameCalendarDay(nextTime, targetDate, userTimezone);
              if (!isOnTargetDate) {
                const targetComponents = this.getDateComponentsInTimezone(targetDate, userTimezone);
                const nextComponents = this.getDateComponentsInTimezone(nextTime, userTimezone);
                logger.warn({
                  reminderId: reminder.id,
                  reminderTitle: reminder.title,
                  frequency: reminder.frequency,
                  targetDate: `${targetComponents.year}-${targetComponents.month + 1}-${targetComponents.day}`,
                  nextTimeDate: `${nextComponents.year}-${nextComponents.month + 1}-${nextComponents.day}`,
                  reason: 'calculateReminderTimeOnDate returned time on wrong date',
                }, 'Reminder time not on target date - setting to null');
                nextTime = null;
              }
            }
            
            if (!nextTime) {
              logger.debug({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                targetDate: this.getDateComponentsInTimezone(targetDate, userTimezone),
              }, 'Reminder does not occur on target date - setting to null');
            }
          } else if (isSpecificMonthFilter && dateFilterRange) {
            // For specific month filters, calculate the occurrence WITHIN that month
            nextTime = this.calculateReminderTimeInRange(reminder, dateFilterRange.start, dateFilterRange.end, userTimezone);
          }
          
          // CRITICAL: For specific date filters, NEVER use fallback - if calculateReminderTimeOnDate
          // returns null, it means the reminder doesn't occur on that date, so we must exclude it
          if (!nextTime && !isSpecificDateFilter) {
            nextTime = this.calculateNextReminderTime(reminder, userLocalTime, userTimezone);
          }
          
          // For specific date filters, ensure nextTime is null if it doesn't match the target date
          if (isSpecificDateFilter && dateFilterRange && nextTime) {
            const targetDate = new Date(dateFilterRange.start);
            if (!this.isSameCalendarDay(nextTime, targetDate, userTimezone)) {
              logger.warn({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                targetDate: this.getDateComponentsInTimezone(targetDate, userTimezone),
                nextTimeDate: this.getDateComponentsInTimezone(nextTime, userTimezone),
                reason: 'nextTime does not match target date - setting to null',
              }, 'Reminder time validation failed for specific date filter');
              nextTime = null;
            }
          }
          
          return { reminder, nextTime: nextTime || ActionExecutor.INVALID_DATE };
        })
        // CRITICAL: Filter out reminders that have already passed
        // For specific date filters, we've already filtered by exact date matching, so we should show all that match
        // For other filters, exclude reminders where nextTime is in the past
        .filter(({ reminder, nextTime }) => {
          // For specific date filters, if nextTime is null or 0, it means the reminder doesn't occur on that date
          if (isSpecificDateFilter) {
            if (!nextTime || nextTime.getTime() === ActionExecutor.INVALID_DATE_TIME) {
              logger.debug({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                reason: 'No nextTime calculated for specific date filter',
              }, 'Reminder filtered out - no nextTime for specific date');
              return false;
            }
            
            // Double-check that nextTime is on the target date (defensive check)
            const targetDate = new Date(dateFilterRange!.start);
            if (!this.isSameCalendarDay(nextTime, targetDate, userTimezone)) {
              const targetComponents = this.getDateComponentsInTimezone(targetDate, userTimezone);
              const nextComponents = this.getDateComponentsInTimezone(nextTime, userTimezone);
              logger.debug({
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                frequency: reminder.frequency,
                targetDate: `${targetComponents.year}-${targetComponents.month + 1}-${targetComponents.day}`,
                nextTimeDate: `${nextComponents.year}-${nextComponents.month + 1}-${nextComponents.day}`,
              }, 'Reminder nextTime does not match target date for specific date filter');
              return false;
            }
            
            // For specific date filters, show all reminders that match the date (even if time has passed)
            return true;
          }
          
          // For non-specific date filters, exclude if no nextTime
          if (!nextTime || nextTime.getTime() === 0) {
            // No next time calculated - exclude for one-time reminders
            // For recurring reminders, we might still want to show them if they're active
            // But if we can't calculate a next time, it's safer to exclude them
            return false;
          }
          
          // For non-specific date filters, check if nextTime is in the past (with tolerance)
          const currentTimeMs = userLocalTimeDate.getTime();
          const nextTimeMs = nextTime.getTime();
          
          // If nextTime is more than the tolerance period in the past, exclude it
          if (nextTimeMs < currentTimeMs - ActionExecutor.PAST_TIME_TOLERANCE_MS) {
            // For one-time reminders, definitely exclude if passed
            if (reminder.frequency === 'once') {
              return false;
            }
            // For recurring reminders, if the calculated nextTime is in the past,
            // it means there's no future occurrence, so exclude it
            return false;
          }
          
          return true;
        })
        .sort((a, b) => a.nextTime.getTime() - b.nextTime.getTime());
      } else {
        // If no timezone, just use reminders as-is without sorting by time
        remindersWithNextTime = filteredReminders.map(reminder => ({ reminder, nextTime: new Date(0) }));
      }

      // Format filter name for title
      let filterTitle = 'Reminders';
      if (parsed.listFilter) {
        const filter = parsed.listFilter.toLowerCase();
        
        // FIRST: Check for specific date patterns (must be checked before month-only patterns)
        // Use helper method to parse specific date
        const extractedDate = this.parseSpecificDateFromText(filter);
        if (extractedDate) {
          // Parse the date to get components for formatting
          const now = new Date();
          const currentYear = now.getFullYear();
          const dateComponents = this.parseSpecificDateComponents(extractedDate, currentYear);
          
          if (dateComponents) {
            const dayNum = dateComponents.day;
            const daySuffix = dayNum === 1 ? 'st' : dayNum === 2 ? 'nd' : dayNum === 3 ? 'rd' : 'th';
            const monthName = ActionExecutor.CAPITALIZED_MONTHS[dateComponents.month];
            
            // Determine format based on original match pattern
            const isDayFirst = /^\d/.test(extractedDate);
            if (isDayFirst) {
              filterTitle = `Reminders for ${dayNum}${daySuffix} ${monthName}`;
            } else {
              filterTitle = `Reminders for ${monthName} ${dayNum}${daySuffix}`;
            }
            specificDateFound = true;
          }
        }
        
        if (specificDateFound) {
          // Already set the title above, skip other checks
        } else if (filter === 'today') {
          filterTitle = "Today's Reminders";
        } else if (filter === 'tomorrow') {
          filterTitle = "Tomorrow's Reminders";
        } else if (filter.includes('next week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) {
          filterTitle = "Next Week's Reminders";
        } else if (filter.includes('this week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) {
          filterTitle = "This Week's Reminders";
        } else if (filter.includes('week') && !filter.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)) {
          filterTitle = "This Week's Reminders";
        } else if (filter.includes('next month')) {
          filterTitle = "Next Month's Reminders";
        } else if (filter.includes('this month')) {
          filterTitle = "This Month's Reminders";
        } else if (filter.includes('month')) {
          filterTitle = "This Month's Reminders";
        } else {
          // Check for day-of-week filters (e.g., "this Thursday", "Thursday")
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const capitalizedDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          let dayOfWeekFound = false;
          
          for (let i = 0; i < dayNames.length; i++) {
            const dayName = dayNames[i];
            // Check for "this [day]" pattern
            if (filter.match(new RegExp(`this\\s+${dayName}`, 'i'))) {
              filterTitle = `Reminders for this ${capitalizedDays[i]}`;
              dayOfWeekFound = true;
              break;
            }
            // Check for just day name
            if (filter.match(new RegExp(`\\b${dayName}\\b`, 'i')) && !filter.includes('week') && !filter.includes('month')) {
              filterTitle = `Reminders for ${capitalizedDays[i]}`;
              dayOfWeekFound = true;
              break;
            }
          }
          
          if (!dayOfWeekFound) {
            // Check if it's just a month name and capitalize it
            // IMPORTANT: Only match month at the start of the string to avoid matching "27th january"
            const monthIndex = ActionExecutor.MONTH_NAMES.findIndex(m => {
              // Extract just the month part if there's additional text
              // Must be at the start of the string to avoid matching dates like "27th january"
              const monthMatch = filter.match(new RegExp(`^(${m})(?:\\s|\\s*-|$)`, 'i'));
              return monthMatch !== null;
            });
            if (monthIndex !== -1) {
              filterTitle = `Reminders for ${this.getCapitalizedMonthName(monthIndex)}`;
            } else {
              // Capitalize first letter of other filters
              const capitalized = parsed.listFilter.charAt(0).toUpperCase() + parsed.listFilter.slice(1).toLowerCase();
              filterTitle = `Reminders for ${capitalized}`;
            }
          }
        }
      }
      
      // Message header is bold - only header and list numbers are bold
      let message = `🔔 *${filterTitle}*\n`;
      
      remindersWithNextTime.slice(0, 20).forEach(({ reminder, nextTime }, index) => {
        // CRITICAL: For specific date filters, double-check that nextTime is on the target date
        // This is a final safety check before display
        if (isSpecificDateFilter && dateFilterRange && nextTime && nextTime.getTime() > 0) {
          const targetDate = new Date(dateFilterRange.start);
          if (!this.isSameCalendarDay(nextTime, targetDate, userTimezone!)) {
            const targetComponents = this.getDateComponentsInTimezone(targetDate, userTimezone!);
            const nextComponents = this.getDateComponentsInTimezone(nextTime, userTimezone!);
            logger.error({
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              frequency: reminder.frequency,
              targetDate: `${targetComponents.year}-${targetComponents.month + 1}-${targetComponents.day}`,
              nextTimeDate: `${nextComponents.year}-${nextComponents.month + 1}-${nextComponents.day}`,
              reason: 'FINAL CHECK: Reminder date does not match target date - skipping display',
            }, 'Reminder failed final date validation - should not be displayed');
            return; // Skip this reminder
          }
        }
        
        let dateDisplay = '';
        let timeDisplay = '';
        
        if (nextTime && nextTime.getTime() > 0 && userTimezone) {
          // CRITICAL: Use getDateComponentsInTimezone to extract date components correctly
          // This avoids timezone conversion issues that can cause dates to shift
          const dateComponents = this.getDateComponentsInTimezone(nextTime, userTimezone);
          
          // Get time components in user's timezone
          const nextTimeInUserTz = this.convertDateToUserTimezone(nextTime, userTimezone);
          const hours = nextTimeInUserTz.getHours();
          const minutes = nextTimeInUserTz.getMinutes();
          
          const day = dateComponents.day;
          const month = ActionExecutor.MONTH_ABBREVIATIONS_SHORT[dateComponents.month];
          
          // Full date + time
          dateDisplay = `${day} ${month}`;
          timeDisplay = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        }
        
        // For birthdays, show only the date specially (no time)
        if (reminder.category === 'Birthdays' && dateDisplay) {
          message += `*${index + 1}.* ${reminder.title} | ${dateDisplay}\n`;
        } else if (dateDisplay && timeDisplay) {
          // Default: show full date & time
          message += `*${index + 1}.* ${reminder.title} | ${dateDisplay} ${timeDisplay}\n`;
        } else if (timeDisplay) {
          // Fallback: only time if date not available
          message += `*${index + 1}.* ${reminder.title} | ${timeDisplay}\n`;
        } else {
          // No date/time info
          message += `*${index + 1}.* ${reminder.title}\n`;
        }
      });

      if (remindersWithNextTime.length > 20) {
        message += `... and ${remindersWithNextTime.length - 20} more reminders.`;
      }

      // Store list context for number-based follow-up actions (delete by number)
      this.storeListContext(
        'reminder',
        remindersWithNextTime.slice(0, 20).map(({ reminder }, index) => ({
          id: reminder.id,
          number: index + 1,
          name: reminder.title,
        }))
      );

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
   * Check if a reminder can occur on a specific date
   * For specific date filters, we check if the reminder can occur on that exact date,
   * not just if the next occurrence from today is on that date
   */
  private isReminderScheduledForDate(
    reminder: any,
    userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
    userTimezone: string
  ): boolean {
    try {
      // Skip inactive reminders
      if (!reminder.active) {
        logger.debug({
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          reason: 'reminder is inactive',
        }, 'Reminder filtered out - inactive');
        return false;
      }

      // For one-time reminders, check directly if they're scheduled for the target date
      if (reminder.frequency === 'once') {
        const matches = this.isOnceReminderScheduledForDate(reminder, userLocalTime, userTimezone);
        logger.debug({
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          frequency: 'once',
          targetDate: `${userLocalTime.year}-${userLocalTime.month + 1}-${userLocalTime.day}`,
          matches,
        }, 'One-time reminder date check');
        return matches;
      }

      // For recurring reminders, check if they can occur on the target date
      const targetYear = userLocalTime.year;
      const targetMonth = userLocalTime.month; // 0-based
      const targetDay = userLocalTime.day;

      switch (reminder.frequency) {
        case 'daily':
          // Daily reminders occur every day, so they will occur on the target date
          return true;

        case 'hourly':
        case 'minutely':
          // These occur very frequently, so they will occur on the target date
          return true;

        case 'weekly':
          // Check if the target date's day of week matches any of the reminder's days
          if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
            const targetDate = new Date(targetYear, targetMonth, targetDay);
            const targetDayOfWeek = targetDate.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
            const matches = reminder.daysOfWeek.includes(targetDayOfWeek);
            logger.debug({
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              targetDayOfWeek,
              reminderDaysOfWeek: reminder.daysOfWeek,
              matches,
            }, 'Weekly reminder day-of-week check');
            return matches;
          }
          return false;

        case 'monthly':
          // For monthly reminders: check if the target day matches the reminder's dayOfMonth
          // Monthly reminders occur on the same day of every month, so we only check the day
          // Note: Monthly reminders don't have a month field - they occur every month on the same day
          if (reminder.dayOfMonth) {
            // Check if the target day matches the reminder's dayOfMonth
            const dayMatches = targetDay === reminder.dayOfMonth;
            
            logger.debug({
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              targetYear,
              targetMonth: targetMonth + 1,
              targetDay,
              reminderDayOfMonth: reminder.dayOfMonth,
              dayMatches,
            }, 'Monthly reminder day check');
            
            return dayMatches;
          }
          
          logger.debug({
            reminderId: reminder.id,
            reminderTitle: reminder.title,
            reason: 'no dayOfMonth set',
          }, 'Monthly reminder filtered out - no dayOfMonth');
          
          return false;

        case 'yearly':
          // For yearly reminders: check if the target month and day match the reminder's month and dayOfMonth
          if (reminder.month && reminder.dayOfMonth) {
            // reminder.month is 1-based (1-12), targetMonth is 0-based (0-11)
            const monthMatches = (reminder.month - 1) === targetMonth;
            const dayMatches = reminder.dayOfMonth === targetDay;
            const matches = monthMatches && dayMatches;
            logger.debug({
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              targetMonth: targetMonth + 1,
              targetDay,
              reminderMonth: reminder.month,
              reminderDayOfMonth: reminder.dayOfMonth,
              monthMatches,
              dayMatches,
              matches,
            }, 'Yearly reminder month and day check');
            return matches;
          }
          return false;

        default:
          // For unknown frequencies, fall back to calculating next occurrence
      const nextTime = this.calculateNextReminderTime(reminder, userLocalTime, userTimezone);
      if (!nextTime) {
        return false;
      }

      // Convert next occurrence to user's timezone for comparison
      const nextTimeFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: userTimezone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
      
      const nextTimeParts = nextTimeFormatter.formatToParts(nextTime);
      const nextYear = parseInt(nextTimeParts.find(p => p.type === 'year')?.value || '0', 10);
          const nextMonth = parseInt(nextTimeParts.find(p => p.type === 'month')?.value || '0', 10) - 1;
      const nextDay = parseInt(nextTimeParts.find(p => p.type === 'day')?.value || '0', 10);

          return nextYear === targetYear &&
                 nextMonth === targetMonth &&
                 nextDay === targetDay;
      }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if reminder is scheduled for date');
      return false;
    }
  }

  /**
   * Check if a one-time reminder is scheduled for a specific date (not just today)
   */
  private isOnceReminderScheduledForDate(
    reminder: any,
    userLocalTime: { year: number; month: number; day: number; hours: number; minutes: number; seconds: number; date: Date },
    userTimezone: string
  ): boolean {
    try {
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
        });
        
        const targetParts = targetDateFormatter.formatToParts(new Date(reminder.targetDate));
        const getPart = (type: string) => targetParts.find(p => p.type === type)?.value || '0';
        
        targetYear = parseInt(getPart('year'), 10);
        targetMonth = parseInt(getPart('month'), 10) - 1; // Convert to 0-11
        targetDay = parseInt(getPart('day'), 10);
      } else if (reminder.daysFromNow !== undefined && reminder.daysFromNow !== null) {
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
        // Specific date (month + dayOfMonth) for one-time reminder (like a birthday)
        // Check if the target date's month and day match the reminder's month and dayOfMonth
        // For one-time reminders with month+day, we check if the filter date matches
        targetYear = userLocalTime.year; // Use the filter year
        targetMonth = reminder.month - 1; // Convert 1-12 to 0-11
        targetDay = reminder.dayOfMonth;
        
        // For one-time reminders with month+day, we need to check if the filter date matches
        // the reminder's month and day, regardless of year (since it's one-time, it should match the exact date)
        // But wait - if it's one-time with month+day, it might be set for a specific year
        // Let's check if there's a targetDate that would give us the year
        // Actually, for filtering purposes, we should check if the filter date's month and day match
        // the reminder's month and day. But we also need to consider the year.
        // Since it's a one-time reminder, if it has month+day but no targetDate,
        // it might be meant for "this year" or "next year" depending on if the date has passed.
        // But for filtering by a specific date, we should check if month and day match.
        
        // CRITICAL: For one-time reminders with month+day (like birthdays),
        // check if the filter date's month and day match the reminder's month and day
        // For one-time reminders, we need to check if the exact date matches
        // If the reminder has a targetDate, we should use that year; otherwise, check month+day match
        
        // Check if month and day match the filter date
        const monthMatches = targetMonth === userLocalTime.month;
        const dayMatches = targetDay === userLocalTime.day;
        
        logger.debug({
          reminderId: reminder.id,
          reminderTitle: reminder.title,
          reminderMonth: reminder.month,
          reminderDayOfMonth: reminder.dayOfMonth,
          targetMonth: targetMonth + 1,
          targetDay,
          userYear: userLocalTime.year,
          userMonth: userLocalTime.month + 1,
          userDay: userLocalTime.day,
          monthMatches,
          dayMatches,
        }, 'One-time reminder with month+day check');
        
        // For one-time reminders with month+day, check if month and day match
        // The year should also match if we're filtering by a specific date
        // But if the reminder doesn't have a targetDate with a year, we just check month+day
        if (monthMatches && dayMatches) {
          // Month and day match - now check if year matches (if reminder has a specific year)
          // For filtering by a specific date, if month and day match, include it
          // (The reminder might be set for any year, or we might need to check targetDate for year)
          return true;
        }
        
        return false;
      } else {
        return false;
      }
      
      // Check if the target date matches the reminder's scheduled date - strict date comparison
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

      return dateMatches;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if one-time reminder is scheduled for date');
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
   * Calculate the reminder time within a specific date range (for filtered month display)
   */
  private calculateReminderTimeInRange(
    reminder: any,
    rangeStart: Date,
    rangeEnd: Date,
    timezone: string
  ): Date | null {
    try {
      // Convert range to user's timezone for calculations
      const startStr = rangeStart.toLocaleString("en-US", { timeZone: timezone });
      const endStr = rangeEnd.toLocaleString("en-US", { timeZone: timezone });
      const startInTz = new Date(startStr);
      const endInTz = new Date(endStr);
      
      const startYear = startInTz.getFullYear();
      const startMonth = startInTz.getMonth() + 1; // 1-based
      const startDay = startInTz.getDate();
      const endYear = endInTz.getFullYear();
      const endMonth = endInTz.getMonth() + 1; // 1-based
      const endDay = endInTz.getDate();
      
      // Extract time components
      const timeParts = reminder.time ? reminder.time.split(':') : ['9', '0'];
      const hours = timeParts[0] ? parseInt(timeParts[0], 10) : 9;
      const minutes = timeParts[1] ? parseInt(timeParts[1], 10) : 0;
      
      switch (reminder.frequency) {
        case 'once':
          if (reminder.targetDate) {
            const target = new Date(reminder.targetDate);
            const targetStr = target.toLocaleString("en-US", { timeZone: timezone });
            const targetInTz = new Date(targetStr);
            if (targetInTz >= startInTz && targetInTz <= endInTz) {
              return targetInTz;
            }
          }
          return null;
          
        case 'monthly':
          if (reminder.dayOfMonth) {
            const reminderDay = reminder.dayOfMonth;
            // Use the month from the range (should be the same month for month filters)
            const targetYear = startYear;
            const targetMonth = startMonth; // 1-based
            const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
            const targetDay = Math.min(reminderDay, lastDayOfMonth);
            
            // Create date in user's timezone
            // First create a date string in the target timezone, then parse it
            const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
            const tempDate = new Date(dateStr);
            const targetStr = tempDate.toLocaleString("en-US", { timeZone: timezone });
            const targetInTz = new Date(targetStr);
            
            if (targetInTz >= startInTz && targetInTz <= endInTz) {
              return targetInTz;
            }
          }
          return null;
          
        case 'yearly':
          if (reminder.month && reminder.dayOfMonth) {
            const reminderMonth = reminder.month; // 1-based
            const reminderDay = reminder.dayOfMonth;
            
            // Check if reminder month matches the range month
            if (reminderMonth === startMonth && startYear === endYear) {
              const targetYear = startYear;
              const lastDayOfMonth = new Date(targetYear, reminderMonth, 0).getDate();
              const targetDay = Math.min(reminderDay, lastDayOfMonth);
              
              // Create date in user's timezone
              // First create a date string in the target timezone, then parse it
              const dateStr = `${targetYear}-${String(reminderMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
              const tempDate = new Date(dateStr);
              const targetStr = tempDate.toLocaleString("en-US", { timeZone: timezone });
              const targetInTz = new Date(targetStr);
              
              if (targetInTz >= startInTz && targetInTz <= endInTz) {
                return targetInTz;
              }
            }
          }
          return null;
          
        case 'weekly':
          if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
            // Find first matching day of week in the range
            const currentDate = new Date(startInTz);
            while (currentDate <= endInTz) {
              const dayOfWeek = currentDate.getDay();
              if (reminder.daysOfWeek.includes(dayOfWeek)) {
                const targetDate = new Date(currentDate);
                targetDate.setHours(hours, minutes, 0, 0);
                return targetDate;
              }
              currentDate.setDate(currentDate.getDate() + 1);
            }
          }
          return null;
          
        case 'daily':
          // Return first day in range with the specified time
          const firstDay = new Date(startInTz);
          firstDay.setHours(hours, minutes, 0, 0);
          return firstDay;
          
        default:
          return null;
      }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error calculating reminder time in range');
      return null;
    }
  }

  /**
   * Calculate the reminder time ON a specific date (not the next occurrence)
   * This is used for specific date filters where we want the occurrence on that exact date
   * @param reminder - The reminder to calculate time for
   * @param targetDate - The specific date to calculate the time for
   * @param timezone - The user's timezone
   * @returns The reminder time on the target date, or null if the reminder doesn't occur on that date
   */
  private calculateReminderTimeOnDate(
    reminder: any,
    targetDate: Date,
    timezone: string
  ): Date | null {
    try {
      if (!reminder.active) {
        return null;
      }

      const targetComponents = this.getDateComponentsInTimezone(targetDate, timezone);
      const targetDateInTz = this.convertDateToUserTimezone(targetDate, timezone);
      const targetDayOfWeek = targetDateInTz.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      
      // Get reminder time (default to 9:00 AM if not specified)
      const reminderTime = reminder.time || '09:00';
      const [hours, minutes] = reminderTime.split(':').map(Number);

      switch (reminder.frequency) {
        case 'once':
          // For one-time reminders, check if the target date matches
          // Use the same logic as isOnceReminderScheduledForDate to ensure consistency
          let reminderTargetDate: Date | null = null;
          
          if (reminder.targetDate) {
            reminderTargetDate = new Date(reminder.targetDate);
          } else if (reminder.daysFromNow !== undefined && reminder.daysFromNow !== null) {
            // Calculate target date from daysFromNow using reminder's creation date
            const reminderCreatedAt = (reminder as any).createdAt 
              ? new Date((reminder as any).createdAt) 
              : targetDateInTz;
            
            const createdComponents = this.getDateComponentsInTimezone(reminderCreatedAt, timezone);
            const targetDateObj = new Date(Date.UTC(
              createdComponents.year, 
              createdComponents.month, 
              createdComponents.day + reminder.daysFromNow
            ));
            reminderTargetDate = this.convertDateToUserTimezone(targetDateObj, timezone);
          } else if (reminder.dayOfMonth && reminder.month) {
            // For one-time reminders with month+day, check if month and day match
            const reminderMonth = reminder.month - 1; // Convert 1-based to 0-based
            if (reminderMonth === targetComponents.month && reminder.dayOfMonth === targetComponents.day) {
              return this.createDateInUserTimezone(
                targetComponents.year,
                targetComponents.month,
                targetComponents.day,
                hours,
                minutes,
                timezone
              );
            }
            return null;
          }
          
          // Check if the reminder's target date matches the filter date
          if (reminderTargetDate && this.isSameCalendarDay(reminderTargetDate, targetDate, timezone)) {
            return this.createDateInUserTimezone(
              targetComponents.year,
              targetComponents.month,
              targetComponents.day,
              hours,
              minutes,
              timezone
            );
          }
          return null;

        case 'daily':
          // Daily reminders occur every day
          return this.createDateInUserTimezone(
            targetComponents.year,
            targetComponents.month,
            targetComponents.day,
            hours,
            minutes,
            timezone
          );

        case 'weekly':
          // Check if the target date's day of week matches
          if (reminder.daysOfWeek && reminder.daysOfWeek.includes(targetDayOfWeek)) {
            return this.createDateInUserTimezone(
              targetComponents.year,
              targetComponents.month,
              targetComponents.day,
              hours,
              minutes,
              timezone
            );
          }
          return null;

        case 'monthly':
          // Check if the target day matches the reminder's dayOfMonth
          if (reminder.dayOfMonth && reminder.dayOfMonth === targetComponents.day) {
            return this.createDateInUserTimezone(
              targetComponents.year,
              targetComponents.month,
              targetComponents.day,
              hours,
              minutes,
              timezone
            );
          }
          return null;

        case 'yearly':
          // Check if the target month and day match
          if (reminder.month && reminder.dayOfMonth) {
            const reminderMonth = reminder.month - 1; // Convert 1-based to 0-based
            if (reminderMonth === targetComponents.month && reminder.dayOfMonth === targetComponents.day) {
              return this.createDateInUserTimezone(
                targetComponents.year,
                targetComponents.month,
                targetComponents.day,
                hours,
                minutes,
                timezone
              );
            }
          }
          return null;

        case 'hourly':
        case 'minutely':
          // These occur frequently, so they will occur on the target date
          // Use the first occurrence of the day (at the specified minute/hour if available)
          return this.createDateInUserTimezone(
            targetComponents.year,
            targetComponents.month,
            targetComponents.day,
            hours || 0,
            minutes || 0,
            timezone
          );

        default:
          return null;
      }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error calculating reminder time on specific date');
      return null;
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
          
          const targetDateTime = this.createDateInUserTimezone(targetYear, targetMonth, targetDay, hours, minutes, userTimezone);
          
          // For one-time reminders, if the target date/time has passed, return null
          const currentTimeMs = userLocalTime.date.getTime();
          const targetTimeMs = targetDateTime.getTime();
          const oneMinuteMs = 60 * 1000;
          
          if (targetTimeMs < currentTimeMs - oneMinuteMs) {
            // Target date/time has passed (more than 1 minute ago), return null
            return null;
          }
          
          return targetDateTime;
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

    // Check for "every [day]" pattern first (e.g., "every tuesday", "every monday", "every thursday and friday")
    // Match patterns like: "every thursday", "every thursday and friday", "every thursday, friday", "every thursday and friday and saturday"
    const everyDayPattern = /every\s+((?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?:\s*(?:,|and)\s*(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))*)/i;
    const everyDayMatch = scheduleLower.match(everyDayPattern);
    if (everyDayMatch && everyDayMatch[1]) {
      result.frequency = 'weekly';
      
      // Extract all days from the match (handles "thursday and friday", "thursday, friday", etc.)
      const daysString = everyDayMatch[1].toLowerCase();
      const daysArray: number[] = [];
      
      // Split by comma or "and" and extract day names
      const dayMatches = daysString.match(/(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)/gi);
      if (dayMatches) {
        for (const dayMatch of dayMatches) {
          const dayIndex = dayNames.indexOf(dayMatch.toLowerCase());
          if (dayIndex !== -1 && !daysArray.includes(dayIndex)) {
            daysArray.push(dayIndex);
          }
        }
      }
      
      if (daysArray.length > 0) {
        result.daysOfWeek = daysArray.sort((a, b) => a - b); // Sort days (Sunday=0, Monday=1, etc.)
      } else {
        // Fallback: if no days found, default to Monday
        result.daysOfWeek = [1];
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
      // Extract day(s) of week - handle multiple days (e.g., "on monday and tuesday", "monday, tuesday")
      const daysArray: number[] = [];
      
      // Match all day names in the string
      const allDayMatches = scheduleLower.match(/(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)/gi);
      if (allDayMatches) {
        for (const dayMatch of allDayMatches) {
          const dayIndex = dayNames.indexOf(dayMatch.toLowerCase());
          if (dayIndex !== -1 && !daysArray.includes(dayIndex)) {
            daysArray.push(dayIndex);
          }
        }
      }
      
      if (daysArray.length > 0) {
        result.daysOfWeek = daysArray.sort((a, b) => a - b); // Sort days (Sunday=0, Monday=1, etc.)
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
    } else if (scheduleLower.includes('every month') || scheduleLower.includes('monthly') || scheduleLower.includes('of each month') || scheduleLower.includes('each month')) {
      result.frequency = 'monthly';
      // Extract day of month - handle patterns like:
      // - "on the 30th of each month"
      // - "the 30th of each month"
      // - "30th of each month"
      // - "monthly on the 30th"
      // - "every month on the 30th"
      // - "on the 30th"
      // First try to match patterns with "of each month" or "of every month" suffix
      let dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(?:each|every)\s+month/i);
      if (!dayMatch) {
        // Try pattern without "of each month" suffix (for cases like "monthly on the 30th" or "on the 30th" when we already detected monthly)
        dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
      }
      if (dayMatch && dayMatch[1]) {
        const dayNum = parseInt(dayMatch[1], 10);
        if (dayNum >= 1 && dayNum <= 31) {
          result.dayOfMonth = dayNum;
        } else {
          // Invalid day, default to 1st
          result.dayOfMonth = 1;
        }
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
          
          // Check for explicit time FIRST (e.g., "tonight at 9pm", "today at 2pm")
            const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
            if (timeMatch && timeMatch[1]) {
              targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
          } else if (scheduleLower.includes('tonight') || scheduleLower.includes('night')) {
            // Only use default "18:00" if no explicit time was found
            targetTime = '18:00';
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
          // Check for explicit time FIRST (e.g., "tonight at 9pm", "today at 2pm")
            const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
            if (timeMatch && timeMatch[1]) {
              result.time = this.parseTimeTo24Hour(timeMatch[1].trim());
          } else if (scheduleLower.includes('tonight') || scheduleLower.includes('night')) {
            // Only use default "18:00" if no explicit time was found
            result.time = '18:00';
          }
        }
      } else if (scheduleLower.includes('later')) {
        // "later" means once, no specific time/date
        result.frequency = 'once';
      } else if (scheduleLower.includes('next week')) {
        // Handle "next week" optionally with a weekday (e.g., "next week Thursday", "Tuesday next week")
        // CRITICAL: "next week [day]" means the [day] of next week (week starts on Monday, ends on Sunday)
        // Calculation: Find next Monday, then find [day] in that week
        
        // Check for weekday - can be before or after "next week" (e.g., "Tuesday next week" or "next week Tuesday")
        const weekdayMatch = scheduleLower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        const targetDow = weekdayMatch ? dayNames.indexOf(weekdayMatch[1].toLowerCase()) : null;

        // Pick a time if specified; otherwise leave undefined so update flow can keep existing time
        let targetTime: string | undefined = undefined;
        const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch && timeMatch[1]) {
          targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
        }
        const targetTimeForDate = targetTime || '09:00'; // fallback only for constructing a Date

        if (timezone) {
          const currentTime = this.getCurrentTimeInTimezone(timezone);
          const currentDate = new Date(currentTime.year, currentTime.month, currentTime.day);
          const currentDow = currentDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
          
          let daysToAdd: number;

          if (targetDow !== null) {
            // "next week [day]" calculation (week starts on Monday):
            // Step 1: Find days until next Monday
            // If today is Monday (1), next Monday is in 7 days
            // Otherwise: (8 - currentDow) % 7 gives days until next Monday, or 7 if that equals 0
            let daysUntilNextMonday = currentDow === 1 ? 7 : ((8 - currentDow) % 7) || 7;
            
            if (currentDow === 0 && targetDow === 0) {
              daysUntilNextMonday += 7; // Add 7 more days to get to the week after next Monday
            }
            
            // Step 2: From next Monday, find the target day
            // Monday=1, Tuesday=2, ..., Sunday=0
            // Offset from Monday: Monday=0, Tuesday=1, ..., Sunday=6
            const offsetFromMonday = targetDow === 0 ? 6 : targetDow - 1;
            daysToAdd = daysUntilNextMonday + offsetFromMonday;
          } else {
            // Just "next week" without a specific day - use 7 days (next week same day)
            daysToAdd = 7;
          }

          const targetDate = new Date(currentDate);
          targetDate.setDate(currentDate.getDate() + daysToAdd);

          const [hours, minutes] = targetTimeForDate.split(':').map(Number);
          result.targetDate = this.createDateInUserTimezone(
            targetDate.getFullYear(),
            targetDate.getMonth(),
            targetDate.getDate(),
            hours,
            minutes,
            timezone
          );
          if (targetTime) {
            result.time = targetTime;
          }
        } else {
          // No timezone: use daysFromNow
          const now = new Date();
          const currentDow = now.getDay();
          
          let daysToAdd: number;
          
          if (targetDow !== null) {
            // "next week [day]" calculation (week starts on Monday, same as timezone case above):
            // Step 1: Find days until next Monday
            let daysUntilNextMonday = currentDow === 1 ? 7 : ((8 - currentDow) % 7) || 7;
            
            // CRITICAL FIX: If today is Sunday (0) and we want "next week Sunday" (0),
            // the "next Monday" is actually tomorrow (same week), so we need to add 7 more days
            // to get to the week AFTER the upcoming Monday
            if (currentDow === 0 && targetDow === 0) {
              daysUntilNextMonday += 7; // Add 7 more days to get to the week after next Monday
            }
            
            // Step 2: From next Monday, find the target day
            // Offset from Monday: Monday=0, Tuesday=1, ..., Sunday=6
            const offsetFromMonday = targetDow === 0 ? 6 : targetDow - 1;
            daysToAdd = daysUntilNextMonday + offsetFromMonday;
          } else {
            daysToAdd = 7;
          }
          
          result.daysFromNow = daysToAdd;
          if (targetTime) {
            result.time = targetTime;
          }
        }
      } else if (scheduleLower.includes('next month')) {
        // Handle "next month 3rd" or "next month 15"
        const dayMatch = scheduleLower.match(/next\s+month\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
        const dayNum = dayMatch && dayMatch[1] ? parseInt(dayMatch[1], 10) : null;

        // Pick a time if specified; otherwise leave undefined so update flow can keep existing time
        let targetTime: string | undefined = undefined;
        const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
        if (timeMatch && timeMatch[1]) {
          targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
        }
        const targetTimeForDate = targetTime || '09:00'; // fallback only for constructing a Date

        if (timezone) {
          const currentTime = this.getCurrentTimeInTimezone(timezone);
          const currentYear = currentTime.year;
          const currentMonth = currentTime.month; // 0-based
          const targetMonth = currentMonth + 1;
          const targetYear = targetMonth > 11 ? currentYear + 1 : currentYear;
          const monthIndex = targetMonth % 12;

          const lastDay = new Date(targetYear, monthIndex + 1, 0).getDate();
          const chosenDay = dayNum ? Math.min(dayNum, lastDay) : Math.min(currentTime.day, lastDay);

          const [hours, minutes] = targetTimeForDate.split(':').map(Number);
          result.targetDate = this.createDateInUserTimezone(
            targetYear,
            monthIndex,
            chosenDay,
            hours,
            minutes,
            timezone
          );
          if (targetTime) {
            result.time = targetTime;
          }
        } else {
          const now = new Date();
          const targetYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
          const targetMonth = (now.getMonth() + 1) % 12;
          const lastDay = new Date(targetYear, targetMonth + 1, 0).getDate();
          const chosenDay = dayNum ? Math.min(dayNum, lastDay) : Math.min(now.getDate(), lastDay);

          const targetDate = new Date(targetYear, targetMonth, chosenDay);
          result.targetDate = targetDate;
          if (targetTime) {
            result.time = targetTime;
          }
        }
      } else if (/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(scheduleLower)) {
        // Single weekday (e.g. "Friday") without "every"/"weekly" → treat as next occurrence of that day
        const weekdayMatch = scheduleLower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        if (weekdayMatch && weekdayMatch[1]) {
          const targetDow = dayNames.indexOf(weekdayMatch[1].toLowerCase());
          if (targetDow !== -1) {
            if (timezone) {
              const currentTime = this.getCurrentTimeInTimezone(timezone);
              const currentDate = new Date(currentTime.year, currentTime.month, currentTime.day);
              const currentDow = currentDate.getDay();
              let diff = targetDow - currentDow;
              if (diff < 0) diff += 7; // next occurrence (including today if same day)

              const targetDate = new Date(currentTime.year, currentTime.month, currentTime.day + diff);

              // Preserve existing time if present in schedule string; otherwise default to 09:00
              let targetTime = '09:00';
              const timeMatch = scheduleLower.match(/(?:at|@)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
              if (timeMatch && timeMatch[1]) {
                targetTime = this.parseTimeTo24Hour(timeMatch[1].trim());
              }

              const [hours, minutes] = targetTime.split(':').map(Number);
              result.targetDate = this.createDateInUserTimezone(
                targetDate.getFullYear(),
                targetDate.getMonth(),
                targetDate.getDate(),
                hours,
                minutes,
                timezone
              );
              result.time = targetTime;
            } else {
              // No timezone: use daysFromNow relative offset
              const now = new Date();
              const currentDow = now.getDay();
              let diff = targetDow - currentDow;
              if (diff < 0) diff += 7;
              result.daysFromNow = diff;
            }
          }
        }
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
        
        // Check for specific date with month name (e.g., "30th January", "January 30th", "on the 30th of January")
        const monthPattern = `(${ActionExecutor.MONTH_NAMES.join('|')}|${ActionExecutor.MONTH_ABBREVIATIONS.join('|')})`;
        
        // Try pattern 1: "30th January" or "on the 30th of January" or "on 30th January"
        let dateWithMonthMatch = scheduleLower.match(new RegExp(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of\\s+)?\\s+${monthPattern}`, 'i'));
        let dayNum: number | undefined;
        let monthName: string | undefined;
        
        if (dateWithMonthMatch && dateWithMonthMatch[1] && dateWithMonthMatch[2]) {
          // Pattern 1: "30th January" - dateWithMonthMatch[1] = day, dateWithMonthMatch[2] = month
          dayNum = parseInt(dateWithMonthMatch[1], 10);
          monthName = dateWithMonthMatch[2].toLowerCase();
        } else {
          // Try pattern 2: "January 30th"
          dateWithMonthMatch = scheduleLower.match(new RegExp(`${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
          if (dateWithMonthMatch && dateWithMonthMatch[1] && dateWithMonthMatch[2]) {
            // Pattern 2: "January 30th" - dateWithMonthMatch[1] = month, dateWithMonthMatch[2] = day
            monthName = dateWithMonthMatch[1].toLowerCase();
            dayNum = parseInt(dateWithMonthMatch[2], 10);
          }
        }
        
        if (dayNum !== undefined && monthName && dayNum >= 1 && dayNum <= 31) {
          // Normalize month name (handle abbreviations)
          const abbrIndex = ActionExecutor.MONTH_ABBREVIATIONS.indexOf(monthName);
          if (abbrIndex !== -1) {
            monthName = ActionExecutor.MONTH_NAMES[abbrIndex];
          }
          
          const monthIndex = ActionExecutor.MONTH_NAMES.indexOf(monthName);
          if (monthIndex !== -1) {
            // For "once" frequency, create a targetDate
            if (timezone) {
              const currentTime = this.getCurrentTimeInTimezone(timezone);
              const currentYear = currentTime.year;
              const targetMonth = monthIndex; // 0-indexed (0-11)
              
              // Determine year: if the date has passed this year, use next year
              const targetDateThisYear = new Date(currentYear, targetMonth, dayNum);
              const currentDate = new Date(currentTime.year, currentTime.month, currentTime.day);
              
              let targetYear = currentYear;
              if (targetDateThisYear < currentDate) {
                targetYear = currentYear + 1;
              }
              
              // Use existing time if specified, otherwise default to 09:00
              let targetTime = result.time || '09:00';
              const [hours, minutes] = targetTime.split(':').map(Number);
              
              result.targetDate = this.createDateInUserTimezone(
                targetYear,
                targetMonth,
                dayNum,
                hours,
                minutes,
                timezone
              );
              result.time = targetTime;
            } else {
              // No timezone: calculate using UTC
              const now = new Date();
              const targetYear = now.getFullYear();
              const targetDateThisYear = new Date(targetYear, monthIndex, dayNum);
              
              let finalYear = targetYear;
              if (targetDateThisYear < now) {
                finalYear = targetYear + 1;
              }
              
              const targetDate = new Date(finalYear, monthIndex, dayNum);
              result.targetDate = targetDate;
              result.time = result.time || '09:00';
            }
          }
        } else {
          // Check for specific date without month (e.g., "on the 1st")
          const dayMatch = scheduleLower.match(/(?:on\s+)?(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?/i);
          if (dayMatch && dayMatch[1]) {
            const dayNumOnly = parseInt(dayMatch[1], 10);
            if (dayNumOnly >= 1 && dayNumOnly <= 31) {
              if (timezone) {
                const currentTime = this.getCurrentTimeInTimezone(timezone);
                const currentDay = currentTime.day;
                const currentMonth = currentTime.month; // 0-indexed (0-11)
                
                // If day is in the past this month, schedule for next month
                if (dayNumOnly < currentDay) {
                  result.dayOfMonth = dayNumOnly;
                  // Next month (currentMonth + 1), convert to 1-12 for database
                  result.month = currentMonth + 2 > 11 ? 1 : currentMonth + 2;
                } else {
                  result.dayOfMonth = dayNumOnly;
                  // Current month (currentMonth + 1), convert to 1-12 for database
                  result.month = currentMonth + 1;
                }
              } else {
                const now = new Date();
                const currentDay = now.getDate();
                // If day is in the past this month, schedule for next month
                if (dayNumOnly < currentDay) {
                  result.dayOfMonth = dayNumOnly;
                  result.month = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
                } else {
                  result.dayOfMonth = dayNumOnly;
                  result.month = now.getMonth() + 1;
                }
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
      
      // Use category from AI analysis (parsed from AI response)
      // If not provided by AI, default to "General"
      let detectedCategory: string | undefined = parsed.reminderCategory || 'General';
      // Fallback: if the title mentions "birthday", treat as Birthdays
      if ((!detectedCategory || detectedCategory.toLowerCase() === 'general') && parsed.taskName?.toLowerCase().includes('birthday')) {
        detectedCategory = 'Birthdays';
      }
      
      // Normalize category name to match database values
      const categoryMap: Record<string, string> = {
        'birthdays': 'Birthdays',
        'birthday': 'Birthdays',
        'general': 'General',
        'once off': 'Once off',
        'onceoff': 'Once off',
        'family & home': 'Family & Home',
        'family and home': 'Family & Home',
        'work and business': 'Work and Business',
        'work': 'Work and Business',
        'business': 'Work and Business',
        'health and wellness': 'Health and Wellness',
        'health': 'Health and Wellness',
        'wellness': 'Health and Wellness',
        'errands': 'Errands',
        'errand': 'Errands',
        'travel': 'Travel',
        'notes': 'Notes',
        'note': 'Notes',
      };
      
      const normalizedCategory = categoryMap[detectedCategory.toLowerCase()] || detectedCategory;
      detectedCategory = normalizedCategory;
      
      // Check if it's a birthday for frequency override
      const isBirthday = detectedCategory === 'Birthdays';
      
      if (isBirthday) {
        // Override frequency to yearly for birthdays
        scheduleData.frequency = 'yearly';
        
        // Try to extract date from schedule string (e.g., "on the 4th October", "4th October", "October 4th", "on the 15th of October", "23rd of December")
        
        // Build regex pattern with both full and abbreviated month names (capturing group)
        const monthPattern = `(${ActionExecutor.MONTH_NAMES.join('|')}|${ActionExecutor.MONTH_ABBREVIATIONS.join('|')})`;
        
        // Try pattern 1: "15th October" or "on the 15th October" or "on the 15th of October" or "23rd of December" or "on 19th October"
        let dateMatch = scheduleStr.match(new RegExp(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of\\s+)?\\s+${monthPattern}`, 'i'));
        let dayNum: number;
        let monthName: string;
        
        if (dateMatch && dateMatch[1] && dateMatch[2]) {
          // Pattern 1: "15th October" or "on the 15th of October" - dateMatch[1] = day, dateMatch[2] = month
          dayNum = parseInt(dateMatch[1], 10);
          monthName = dateMatch[2].toLowerCase();
        } else {
          // Try pattern 2: "October 15th" or "Dec 23rd" (monthPattern already has capturing group)
          dateMatch = scheduleStr.match(new RegExp(`${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
          if (dateMatch && dateMatch[1] && dateMatch[2]) {
            // Pattern 2: "October 15th" - dateMatch[1] = month, dateMatch[2] = day
            monthName = dateMatch[1].toLowerCase();
            dayNum = parseInt(dateMatch[2], 10);
          }
        }
        
        // Normalize month name (handle abbreviations)
        if (monthName) {
          const abbrIndex = ActionExecutor.MONTH_ABBREVIATIONS.indexOf(monthName);
          if (abbrIndex !== -1) {
            monthName = ActionExecutor.MONTH_NAMES[abbrIndex];
          }
        }
        
        if (monthName && dayNum >= 1 && dayNum <= 31 && ActionExecutor.MONTH_NAMES.includes(monthName)) {
          const monthIndex = ActionExecutor.MONTH_NAMES.indexOf(monthName);
          if (monthIndex !== -1) {
            scheduleData.dayOfMonth = dayNum;
            scheduleData.month = monthIndex + 1; // 1-12
            logger.info(
              {
                scheduleStr,
                parsedDay: dayNum,
                parsedMonth: monthName,
                monthIndex: monthIndex + 1,
                storedMonth: scheduleData.month,
                storedDayOfMonth: scheduleData.dayOfMonth,
              },
              'Successfully parsed birthday date'
            );
          }
        } else {
          logger.warn(
            {
              scheduleStr,
              parsedDay: dayNum,
              parsedMonth: monthName,
              originalMatch: dateMatch,
            },
            'Failed to parse birthday date from schedule string'
          );
        }

        // If we still don't have a specific month/day (e.g. schedule was just "today" or "tomorrow"),
        // derive them from the resolved targetDate or daysFromNow in the user's timezone so that
        // birthdays are always stored as proper yearly reminders with month + dayOfMonth set.
        if (!scheduleData.month || !scheduleData.dayOfMonth) {
          let baseDate: Date | null = null;

          if (scheduleData.targetDate) {
            // Use the targetDate that was already computed (in user timezone if provided)
            baseDate = timezone
              ? new Date(scheduleData.targetDate.toLocaleString('en-US', { timeZone: timezone }))
              : new Date(scheduleData.targetDate);
          } else if (typeof scheduleData.daysFromNow === 'number') {
            if (timezone) {
              const currentTime = this.getCurrentTimeInTimezone(timezone);
              baseDate = new Date(currentTime.year, currentTime.month, currentTime.day + scheduleData.daysFromNow);
            } else {
              const now = new Date();
              baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + scheduleData.daysFromNow);
            }
          } else {
            // Fallback: treat as "today" in user's timezone
            if (timezone) {
              const currentTime = this.getCurrentTimeInTimezone(timezone);
              baseDate = new Date(currentTime.year, currentTime.month, currentTime.day);
            } else {
              const now = new Date();
              baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            }
          }

          if (baseDate) {
            scheduleData.month = baseDate.getMonth() + 1; // 1-12
            scheduleData.dayOfMonth = baseDate.getDate();
          }

          // Clear relative/one-off fields so the DB stores a clean yearly birthday
          scheduleData.daysFromNow = undefined;
          scheduleData.targetDate = undefined;
        }

        // Final safety: if month/day are still missing for a birthday, force them to tomorrow
        if (!scheduleData.month || !scheduleData.dayOfMonth) {
          const now = timezone
            ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
            : new Date();
          const tomorrow = new Date(now);
          tomorrow.setDate(now.getDate() + 1);
          scheduleData.month = tomorrow.getMonth() + 1;
          scheduleData.dayOfMonth = tomorrow.getDate();
        }

        // Default time to 9am for birthdays if not specified
        if (!scheduleData.time) {
          scheduleData.time = '09:00';
        }

        // For birthdays we store month/day + time; targetDate is optional and can remain unset.
        // Clear targetDate/daysFromNow to avoid conflicts for yearly reminders.
        scheduleData.targetDate = undefined;
        scheduleData.daysFromNow = undefined;
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
      
      // Validate that for yearly birthdays, we have month and dayOfMonth
      if (isBirthday && scheduleData.frequency === 'yearly') {
        if (!scheduleData.month || !scheduleData.dayOfMonth) {
          logger.error(
            {
              userId: this.userId,
              scheduleStr,
              parsedSchedule: scheduleData,
              isBirthday,
            },
            'CRITICAL: Yearly birthday reminder missing month or dayOfMonth - parsing may have failed'
          );
        }
      }
      
      // Check for existing reminders with the same title and add indexing if needed
      let finalTitle = parsed.taskName;
      try {
        const existingReminders = await getRemindersByUserId(this.db, this.userId);
        const baseTitle = parsed.taskName.trim();
        
        // Find all reminders that start with the base title (exact match or with -N suffix)
        const matchingReminders = existingReminders.filter(r => {
          const reminderTitle = r.title.trim();
          // Exact match
          if (reminderTitle === baseTitle) return true;
          // Match with -N suffix (e.g., "Meeting-1", "Meeting-2")
          const suffixMatch = reminderTitle.match(new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
          return !!suffixMatch;
        });
        
        if (matchingReminders.length > 0) {
          // Extract all index numbers from matching reminders
          const indices: number[] = [];
          matchingReminders.forEach(r => {
            const reminderTitle = r.title.trim();
            if (reminderTitle === baseTitle) {
              // Exact match counts as index 0 (no suffix)
              indices.push(0);
            } else {
              const suffixMatch = reminderTitle.match(new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`));
              if (suffixMatch && suffixMatch[1]) {
                indices.push(parseInt(suffixMatch[1], 10));
              }
            }
          });
          
          // Find the next available index
          const maxIndex = Math.max(...indices, -1);
          const nextIndex = maxIndex + 1;
          
          if (nextIndex === 0) {
            // First duplicate - keep original name, rename existing to -1
            // But actually, we should add -1 to the new one to avoid confusion
            finalTitle = `${baseTitle}-1`;
          } else {
            finalTitle = `${baseTitle}-${nextIndex}`;
          }
          
          logger.info(
            {
              userId: this.userId,
              originalTitle: parsed.taskName,
              finalTitle,
              matchingCount: matchingReminders.length,
              indices,
              nextIndex,
            },
            'Added indexing to reminder title due to duplicates'
          );
        }
      } catch (error) {
        logger.warn({ error, userId: this.userId, title: parsed.taskName }, 'Failed to check for duplicate reminder titles, using original title');
      }
      
      const reminderInput: CreateReminderInput = {
        userId: this.userId,
        title: finalTitle,
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
        category: detectedCategory,
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

      logger.info(
        {
          userId: this.userId,
          reminderId: reminder.id,
          timezone,
          reminderFrequency: reminder.frequency,
          reminderMonth: reminder.month,
          reminderDayOfMonth: reminder.dayOfMonth,
          reminderCategory: reminder.category,
        },
        'Reminder created'
      );

      // Calculate next occurrence date for the reminder
      let dateInfo = '';
      
      // For yearly reminders with month and dayOfMonth, use the stored values directly (no timezone conversion)
      if (reminder.frequency === 'yearly' && reminder.month && reminder.dayOfMonth) {
        const day = reminder.dayOfMonth;
        const monthIndex = reminder.month - 1; // Convert 1-12 to 0-11
        
        // Validate monthIndex is in valid range
        if (monthIndex < 0 || monthIndex > 11) {
          logger.error(
            {
              userId: this.userId,
              reminderId: reminder.id,
              storedMonth: reminder.month,
              monthIndex,
              scheduleStr,
            },
            'CRITICAL: Invalid month index for yearly reminder - falling back to timezone calculation'
          );
        } else {
          const monthName = this.getMonthAbbreviation(monthIndex);
          const time = reminder.time || '09:00';
          dateInfo = `${day} ${monthName} ${time}`;
          
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              day,
              monthIndex,
              monthName,
              time,
              dateInfo,
              scheduleStr,
            },
            'Formatted yearly reminder date from stored values'
          );
        }
      } else if (reminder.frequency === 'yearly') {
        // Yearly reminder but missing month or dayOfMonth - this indicates parsing failed
        logger.error(
          {
            userId: this.userId,
            reminderId: reminder.id,
            reminderMonth: reminder.month,
            reminderDayOfMonth: reminder.dayOfMonth,
            scheduleStr,
            reminderInputMonth: reminderInput.month,
            reminderInputDayOfMonth: reminderInput.dayOfMonth,
          },
          'CRITICAL: Yearly reminder missing month or dayOfMonth - date parsing may have failed. Falling back to timezone calculation.'
        );
      }
      
      // For "once" reminders with targetDate, format it directly
      if (!dateInfo && reminder.frequency === 'once' && reminder.targetDate) {
        const targetDate = new Date(reminder.targetDate);
        
        if (timezone) {
          // Format the target date using Intl.DateTimeFormat to get correct timezone components
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
          
          const parts = formatter.formatToParts(targetDate);
          const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
          
          const day = parseInt(getPart('day'), 10);
          const month = parseInt(getPart('month'), 10) - 1; // Convert to 0-indexed
          const year = parseInt(getPart('year'), 10);
          const hours = parseInt(getPart('hour'), 10);
          const minutes = parseInt(getPart('minute'), 10);
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Get current time in user's timezone for comparison
          const timeComponents = this.getCurrentTimeInTimezone(timezone);
          const todayInUserTz = new Date(timeComponents.year, timeComponents.month, timeComponents.day);
          const tomorrowInUserTz = new Date(timeComponents.year, timeComponents.month, timeComponents.day + 1);
          const nextDateInUserTz = new Date(year, month, day);
          
          let dateLabel = 'Today';
          if (nextDateInUserTz.getTime() === todayInUserTz.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateInUserTz.getTime() === tomorrowInUserTz.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const monthName = this.getMonthAbbreviation(month);
            dateLabel = `${day} ${monthName}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
          
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              targetDate: targetDate.toISOString(),
              dateLabel,
              time24,
              dateInfo,
            },
            'Formatted once reminder date from targetDate'
          );
        } else {
          // No timezone: format using local date
          const day = targetDate.getDate();
          const month = targetDate.getMonth();
          const hours = targetDate.getHours();
          const minutes = targetDate.getMinutes();
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          const monthName = this.getMonthAbbreviation(month);
          dateInfo = `${day} ${monthName} ${time24}`;
        }
      }
      
      // Fallback: Use timezone-based calculation if dateInfo still not set
      if (!dateInfo && timezone) {
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
          // Format the next occurrence date using Intl.DateTimeFormat to get correct timezone components
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
          
          const parts = formatter.formatToParts(nextOccurrence);
          const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
          
          const day = parseInt(getPart('day'), 10);
          const month = parseInt(getPart('month'), 10) - 1; // Convert to 0-indexed
          const year = parseInt(getPart('year'), 10);
          const hours = parseInt(getPart('hour'), 10);
          const minutes = parseInt(getPart('minute'), 10);
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Determine if it's today, tomorrow, or a specific date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          // Create date objects for comparison (in user's timezone)
          const nextDateInUserTz = new Date(year, month, day);
          const todayInUserTz = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day);
          const tomorrowInUserTz = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1);
          
          let dateLabel = 'Today';
          if (nextDateInUserTz.getTime() === todayInUserTz.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateInUserTz.getTime() === tomorrowInUserTz.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const monthName = this.getMonthAbbreviation(month);
            dateLabel = `${day} ${monthName}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
        }
      }
      
      // Format frequency text
      const frequencyLabels: Record<string, string> = {
        'daily': 'Daily',
        'hourly': 'Hourly',
        'minutely': 'Every N minutes',
        'once': 'Once',
        'weekly': 'Weekly',
        'monthly': 'Monthly',
        'yearly': 'Yearly',
      };
      let frequencyText = frequencyLabels[reminder.frequency] || reminder.frequency;
      
      // For weekly reminders, append days of the week if specified
      if (reminder.frequency === 'weekly' && reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
        const dayAbbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Sort days to display them in order (Monday first, then Tuesday, etc., with Sunday last)
        const sortedDays = [...reminder.daysOfWeek].sort((a, b) => {
          // Sort: Monday (1) through Saturday (6) first, then Sunday (0) last
          if (a === 0) return 1; // Sunday goes to end
          if (b === 0) return -1;
          return a - b;
        });
        const dayNames = sortedDays.map(day => dayAbbreviations[day]).join(', ');
        frequencyText = `Weekly(${dayNames})`;
      }
      
      // Get category (default to "General" if not set)
      const categoryText = reminder.category || 'General';
      
      // If there's no specific date but we have a time, show it explicitly
      const timeLine = !dateInfo && reminder.time ? `\nTime: ${reminder.time}` : '';
      
      // Message header is bold - reminder title is NOT bold
      const responseMessage = `✅ *New Reminder Created:*\nTitle: ${reminder.title}\nCategory: ${categoryText}\nFrequency: ${frequencyText}${dateInfo ? `\nDate: ${dateInfo}` : ''}${timeLine}`;

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

      // Support number-based updates using last reminders list context
      const numberTokens = parsed.taskName
        .split(/[\s,]+|and/i)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => parseInt(t, 10))
        .filter(n => !isNaN(n) && n > 0);

      let reminder: any = null;

      if (numberTokens.length > 0) {
        const listContext = this.getListContext();
        if (listContext && listContext.type === 'reminder') {
          // Get the first number (for now, only support updating one reminder at a time)
          const targetNumber = numberTokens[0];
          const target = listContext.items.find(item => item.number === targetNumber);
          if (target) {
            const reminders = await getRemindersByUserId(this.db, this.userId);
            reminder = reminders.find(r => r.id === target.id);
            if (reminder) {
              logger.info({ userId: this.userId, reminderId: reminder.id, reminderNumber: targetNumber }, 'Reminder found by number for update');
            }
          }
        }
        // If context missing or no target found, continue with title-based logic below
      }

      // Find reminder by title if not found by number
      if (!reminder) {
        const reminders = await getRemindersByUserId(this.db, this.userId);
          const rawName = parsed.taskName!.trim().toLowerCase();
        
        // ⚠️ CRITICAL: Check if this is a generic reminder name (e.g., "Reminder", "Reminder-1", "Reminder-2")
        // If so, prioritize the MOST RECENTLY CREATED reminder
          const isGenericName =
            rawName === 'reminder' ||
            rawName === 'a reminder' ||
            rawName === 'this reminder' ||
            rawName === 'that reminder' ||
          rawName === 'it' ||
          /^reminder-\d+$/i.test(rawName) || // Matches "Reminder-1", "Reminder-2", etc.
          /^reminder\s*\d*$/i.test(rawName); // Matches "Reminder", "Reminder 1", etc.

          if (isGenericName && reminders.length > 0) {
          // Sort by creation date (newest first) and use the most recent one
            reminder = [...reminders].sort((a, b) => {
              const aCreated = new Date(a.createdAt as any).getTime();
              const bCreated = new Date(b.createdAt as any).getTime();
              return bCreated - aCreated; // newest first
            })[0];
          
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              parsedTaskName: parsed.taskName,
              totalReminders: reminders.length,
            },
            'Using most recently created reminder for generic name'
          );
        } else {
          // Try to find by exact or partial title match
          const matchingReminders = reminders.filter(r => 
            r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
            parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
          );
          
          if (matchingReminders.length === 0) {
            reminder = null;
          } else if (matchingReminders.length === 1) {
            // Single match - use it
            reminder = matchingReminders[0];
          } else {
            // Multiple matches - prioritize the MOST RECENTLY CREATED reminder
            reminder = [...matchingReminders].sort((a, b) => {
              const aCreated = new Date(a.createdAt as any).getTime();
              const bCreated = new Date(b.createdAt as any).getTime();
              return bCreated - aCreated; // newest first
            })[0];
            
            logger.info(
              {
                userId: this.userId,
                reminderId: reminder.id,
                reminderTitle: reminder.title,
                parsedTaskName: parsed.taskName,
                totalMatches: matchingReminders.length,
                allMatches: matchingReminders.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt })),
              },
              'Multiple reminders matched, using most recently created one (update)'
            );
          }
        }
      }

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

        // Check if this is a title-only change (no date/time/schedule changes)
        // This check must be done early to prevent processing time/date changes when only title is being updated
        // IMPORTANT: Exclude "title" and "rename" from date keyword matching to avoid false positives
        // Use word boundaries to match "time" as a whole word, not inside "title"
        const hasDateKeywords = /\b(?:date|schedule|on|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)|every|daily|weekly|monthly|yearly|hourly|minutely)\b/i.test(changes) && !changes.includes('title') && !changes.includes('rename');
        const hasTimeKeywords = /(?:at|@|\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)|morning|afternoon|evening|night|noon|midday|midnight)/i.test(changes);

        // 1) Check for explicit schedule changes (e.g., "schedule: every Friday", "schedule to every Monday at 8am")
        const scheduleChangeMatch =
          parsed.newName.match(/\bschedule\s*:\s*([^-\n]+)(?:\s*-\s*status:.*)?$/i) ||
          parsed.newName.match(/\bschedule\s+to\s+(.+?)(?:\s*-\s*status:.*)?$/i);

        // Check if this is a title-only change (no date/time/schedule changes)
        // This check must be done early to prevent processing time/date changes when only title is being updated
        const isTitleOnlyChange = !scheduleChangeMatch && !hasDateKeywords && !hasTimeKeywords && 
          !changes.includes('time') && !changes.includes('date') && !changes.includes('schedule') &&
          !changes.includes('delay');

        // Check for delay command (e.g., "delay the reminder", "delay by 10 minutes")
        const delayMatch = changes.match(/delay(?:\s+the\s+reminder)?(?:\s+by)?\s*(\d+)?\s*(?:minutes?|mins?)?/i);
        if (delayMatch && !isTitleOnlyChange) {
          let delayMinutes: number | null = null;
          
          // If specific minutes are mentioned, use those
          if (delayMatch[1]) {
            delayMinutes = parseInt(delayMatch[1], 10);
          } else {
            // Otherwise, get default delay minutes from preferences
            try {
              const preferences = await getUserPreferences(this.db, this.userId);
              if (preferences?.defaultDelayMinutes) {
                delayMinutes = preferences.defaultDelayMinutes;
                logger.info(
                  {
                    userId: this.userId,
                    reminderId: reminder.id,
                    defaultDelayMinutes: delayMinutes,
                  },
                  'Using default delay minutes from preferences'
                );
              }
            } catch (error) {
              logger.warn({ error, userId: this.userId }, 'Failed to get user preferences for default delay minutes');
            }
          }
          
          if (delayMinutes && delayMinutes > 0) {
            // Calculate new time by adding delay minutes to current reminder time
            let currentTime: string | null = reminder.time || null;
            let currentDate: Date | null = reminder.targetDate ? new Date(reminder.targetDate) : null;
            
            // If no time is set, use current time in user's timezone
            if (!currentTime) {
              if (timezone) {
                const currentTimeComponents = this.getCurrentTimeInTimezone(timezone);
                currentTime = `${String(currentTimeComponents.hour).padStart(2, '0')}:${String(currentTimeComponents.minute).padStart(2, '0')}`;
                const now = new Date();
                const userNowString = now.toLocaleString("en-US", { timeZone: timezone });
                currentDate = new Date(userNowString);
              } else {
                const now = new Date();
                currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                currentDate = now;
              }
            }
            
            // If no date is set, use current date
            if (!currentDate) {
              if (timezone) {
                const now = new Date();
                const userNowString = now.toLocaleString("en-US", { timeZone: timezone });
                currentDate = new Date(userNowString);
              } else {
                currentDate = new Date();
              }
            }
            
            // Parse current time and add delay minutes
            const [hours, minutes] = currentTime.split(':').map(Number);
            const currentDateTime = new Date(currentDate);
            currentDateTime.setHours(hours, minutes, 0, 0);
            
            // Add delay minutes
            const delayedDateTime = new Date(currentDateTime.getTime() + delayMinutes * 60 * 1000);
            
            // Extract new time
            const newHours = delayedDateTime.getHours();
            const newMinutes = delayedDateTime.getMinutes();
            const newTime = `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
            
            // Update reminder with new time
            updateInput.time = newTime;
            
            // Update targetDate if it exists, otherwise set it
            if (timezone) {
              const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
              });
              const parts = formatter.formatToParts(delayedDateTime);
              const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
              
              const year = parseInt(getPart('year'), 10);
              const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
              const day = parseInt(getPart('day'), 10);
              
              updateInput.targetDate = this.createDateInUserTimezone(year, month, day, newHours, newMinutes, timezone);
            } else {
              updateInput.targetDate = delayedDateTime;
            }
            
            // Clear daysFromNow since we're using targetDate
            updateInput.daysFromNow = null;
            // Ensure frequency is "once" for delayed reminders
            updateInput.frequency = 'once';
            
            logger.info(
              {
                userId: this.userId,
                reminderId: reminder.id,
                originalTime: currentTime,
                delayMinutes,
                newTime,
                originalDate: reminder.targetDate,
                newDate: updateInput.targetDate,
                timezone,
              },
              'Reminder delayed'
            );
          } else {
            return {
              success: false,
              message: "I couldn't determine how long to delay the reminder. Please specify the delay time (e.g., 'delay by 10 minutes') or set a default delay in your preferences.",
            };
          }
        }
        else if (scheduleChangeMatch && scheduleChangeMatch[1]) {
          const rawSchedule = scheduleChangeMatch[1].trim();
          const scheduleData = this.parseReminderSchedule(rawSchedule, timezone);

          const hasExplicitTimeInSchedule = /(?:\d{1,2}:\d{2}|\d{1,2}\s*(am|pm)|morning|afternoon|evening|night|noon|midday|midnight)/i.test(
            rawSchedule
          );

          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              parsedNewName: parsed.newName,
              rawSchedule,
              scheduleData,
              timezone,
            },
            'Processing schedule change for reminder'
          );

          // Apply frequency/type changes
          if (scheduleData.frequency) {
            updateInput.frequency = scheduleData.frequency;
          }

          // Weekly / daily / monthly / yearly / minutely / hourly fields
          if (Array.isArray(scheduleData.daysOfWeek)) {
            updateInput.daysOfWeek = scheduleData.daysOfWeek;
          }
          if (typeof scheduleData.dayOfMonth === 'number') {
            updateInput.dayOfMonth = scheduleData.dayOfMonth;
          }
          if (typeof scheduleData.month === 'number') {
            updateInput.month = scheduleData.month;
          }
          if (typeof scheduleData.minuteOfHour === 'number') {
            updateInput.minuteOfHour = scheduleData.minuteOfHour;
          }
          if (typeof scheduleData.intervalMinutes === 'number') {
            updateInput.intervalMinutes = scheduleData.intervalMinutes;
          }

          // For non-once/relative schedules, clear one-off fields
          if (scheduleData.frequency && scheduleData.frequency !== 'once') {
            updateInput.daysFromNow = null;
            updateInput.targetDate = undefined;
          } else {
            // If this is a one-off schedule (e.g. "on 3rd February at 9am"), apply targetDate/daysFromNow as well
            if (scheduleData.targetDate) {
              updateInput.targetDate = scheduleData.targetDate;
            }
            if (typeof scheduleData.daysFromNow === 'number') {
              updateInput.daysFromNow = scheduleData.daysFromNow;
            }
          }

          // Time: only override if the user explicitly specified a time in the schedule text.
          if (hasExplicitTimeInSchedule && scheduleData.time) {
            updateInput.time = scheduleData.time;
          }
        }

        // Skip time/date processing if this is a title-only change
        if (!isTitleOnlyChange) {
        // 2) Check for relative time patterns (e.g., "in 5 hours", "5 hours from now", "in 10 minutes", "schedule to in 5 hours")
        // Match patterns like: "in 5 hours", "5 hours from now", "schedule to in 5 hours", "change to in 2 hours"
        // First try to match patterns that already start with "in"
        let relativeTimeMatch = parsed.newName.match(/in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)(?:\s+from\s+now)?/i);
        let relativeTimeStr: string | null = null;
        
        if (relativeTimeMatch) {
          // Already starts with "in", use as-is
          relativeTimeStr = relativeTimeMatch[0];
        } else {
          // Try to match patterns with prefixes like "schedule to in", "change to in", etc.
          relativeTimeMatch = parsed.newName.match(/(?:schedule\s+to|change\s+to|update\s+to|to)\s+in\s+(\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days)(?:\s+from\s+now)?/i);
          if (relativeTimeMatch) {
            // Extract just the "in X hours" part
            relativeTimeStr = `in ${relativeTimeMatch[1]} ${relativeTimeMatch[2]}`;
          }
        }
        
        if (relativeTimeMatch && relativeTimeStr) {
          
          // Handle relative time update - parse the extracted relative time string
          const scheduleData = this.parseReminderSchedule(relativeTimeStr, timezone);
          
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              parsedNewName: parsed.newName,
              extractedRelativeTime: relativeTimeStr,
              scheduleData,
              timezone,
            },
            'Processing relative time update for reminder'
          );
          
          if (scheduleData.targetDate) {
            updateInput.targetDate = scheduleData.targetDate;
            // Also update time if scheduleData has a time
            if (scheduleData.time) {
              updateInput.time = scheduleData.time;
            }
            // Clear daysFromNow since we're using targetDate
            updateInput.daysFromNow = null;
            // Ensure frequency is "once" for relative time updates
            updateInput.frequency = 'once';
          } else if (scheduleData.daysFromNow !== undefined) {
            updateInput.daysFromNow = scheduleData.daysFromNow;
            if (scheduleData.time) {
              updateInput.time = scheduleData.time;
            }
            // Clear targetDate since we're using daysFromNow
            updateInput.targetDate = null;
            // Ensure frequency is "once" for relative time updates
            updateInput.frequency = 'once';
          }
        }
        // 3) Check for time changes (absolute time like "at 5pm" or "time to 3pm")
        else if (changes.includes('time') || changes.includes('at')) {
          // 1) Prefer explicit "time to" or "at" patterns
          let timeMatch = parsed.newName.match(/(?:time\s+to|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

          // 2) Fallback: handle "to 3pm" or "to 15:00" but avoid picking up date parts like "to 23rd January"
          if (!timeMatch) {
            timeMatch = parsed.newName.match(/to\s+(\d{1,2}(?::\d{2})\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i);
          }

          if (timeMatch && timeMatch[1]) {
            const newTime = this.parseTimeTo24Hour(timeMatch[1].trim());
            updateInput.time = newTime;
            
            // ⚠️ CRITICAL: When only time is updated (no date change), preserve the original targetDate
            // Update targetDate to use the new time but keep the same date
            if (reminder.targetDate) {
              // Preserve the original date, just update the time
              const originalDate = new Date(reminder.targetDate);
              
              if (timezone) {
                // Get date components in user's timezone
                const formatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: timezone,
                  year: 'numeric',
                  month: 'numeric',
                  day: 'numeric',
                });
                const parts = formatter.formatToParts(originalDate);
                const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
                
                const year = parseInt(getPart('year'), 10);
                const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
                const day = parseInt(getPart('day'), 10);
                
                // Parse new time
                const [hours, minutes] = newTime.split(':').map(Number);
                
                // Create new date with original date but new time
                updateInput.targetDate = this.createDateInUserTimezone(year, month, day, hours, minutes, timezone);
                
                logger.info(
                  {
                    userId: this.userId,
                    reminderId: reminder.id,
                    originalTargetDate: reminder.targetDate,
                    originalTime: reminder.time,
                    newTime,
                    updatedTargetDate: updateInput.targetDate,
                    timezone,
                  },
                  'Time-only update: preserving original date, updating time'
                );
              } else {
                // Fallback: no timezone, adjust on the raw Date object
                const [hours, minutes] = newTime.split(':').map(Number);
                const adjusted = new Date(originalDate);
                adjusted.setHours(hours, minutes, 0, 0);
                updateInput.targetDate = adjusted;
                
                logger.info(
                  {
                    userId: this.userId,
                    reminderId: reminder.id,
                    originalTargetDate: reminder.targetDate,
                    originalTime: reminder.time,
                    newTime,
                    updatedTargetDate: updateInput.targetDate,
                  },
                  'Time-only update: preserving original date, updating time (no timezone)'
                );
              }
            } else if (reminder.daysFromNow !== null && reminder.daysFromNow !== undefined) {
              // If reminder uses daysFromNow, preserve it (don't convert to targetDate)
              // Just update the time
              updateInput.daysFromNow = reminder.daysFromNow;
              
              logger.info(
                {
                  userId: this.userId,
                  reminderId: reminder.id,
                  originalDaysFromNow: reminder.daysFromNow,
                  originalTime: reminder.time,
                  newTime,
                },
                'Time-only update: preserving daysFromNow, updating time'
              );
            }
          }
        }
        
        // Check for date changes - also check if the string contains month names (for birthday/weekday updates)
        const allMonthNames = [...ActionExecutor.MONTH_NAMES, ...ActionExecutor.MONTH_ABBREVIATIONS];
        const hasMonthName = allMonthNames.some(month => changes.includes(month));
        const hasExplicitTimeInChange = /(?:\d{1,2}:\d{2}|\d{1,2}\s*(am|pm))/i.test(parsed.newName);
        
        // Only process date changes if we haven't already handled a relative time update
        if (!relativeTimeMatch && (changes.includes('date') || changes.includes('today') || changes.includes('tomorrow') || changes.includes('monday') || changes.includes('tuesday') || changes.includes('wednesday') || changes.includes('thursday') || changes.includes('friday') || changes.includes('saturday') || changes.includes('sunday') || hasMonthName)) {
          // Extract just the date part from "date to today" or "date to tomorrow" etc.
          // This helps parseReminderSchedule correctly identify "today" or "tomorrow"
          let scheduleToParse = parsed.newName;
          
          // If the string contains "date to [something]", extract just the date part for parsing
          const dateToMatch = parsed.newName.match(/date\s+to\s+([^-]+?)(?:\s*-\s*time|$)/i);
          if (dateToMatch && dateToMatch[1]) {
            // Extract the date part (e.g., "today", "tomorrow", "25th January")
            scheduleToParse = dateToMatch[1].trim();
            // If there's also a time specified, append it
            const timeMatch = parsed.newName.match(/time\s+to\s+([^-]+?)(?:\s*-\s*|$)/i);
            if (timeMatch && timeMatch[1]) {
              scheduleToParse += ` at ${timeMatch[1].trim()}`;
            }
          }
          
          const scheduleData = this.parseReminderSchedule(scheduleToParse, timezone);
          if (scheduleData.daysFromNow !== undefined) {
            updateInput.daysFromNow = scheduleData.daysFromNow;
            // Clear targetDate when using daysFromNow
            updateInput.targetDate = null;
          }
          if (scheduleData.targetDate) {
            // If user specified a time in the change (e.g., "date to today - time to 08:00"),
            // use the time from scheduleData (which was parsed from the combined string)
            if (hasExplicitTimeInChange && scheduleData.time) {
              // scheduleData.targetDate already includes the correct time from parseReminderSchedule
              updateInput.targetDate = scheduleData.targetDate;
              updateInput.time = scheduleData.time;
            } else if (!hasExplicitTimeInChange && reminder.time) {
            // If user didn't specify a new time (e.g. "date to tomorrow"), keep existing reminder.time
            // and ensure targetDate is constructed in the user's timezone so that the stored
            // targetDate and time fields represent the same local time for the user.
              const [hRaw, mRaw] = reminder.time.split(':').map((v) => parseInt(v, 10));
              const hours = isNaN(hRaw) ? 0 : hRaw;
              const minutes = isNaN(mRaw) ? 0 : mRaw;

              if (timezone) {
                // Derive year/month/day in the user's timezone from the parsed targetDate
                const baseInUserTz = new Date(scheduleData.targetDate.toLocaleString('en-US', { timeZone: timezone }));
                const year = baseInUserTz.getFullYear();
                const month = baseInUserTz.getMonth();
                const day = baseInUserTz.getDate();

                // Use the helper to create a Date that, when interpreted in the user's timezone,
                // matches the existing reminder.time on the new date.
                const adjusted = this.createDateInUserTimezone(year, month, day, hours, minutes, timezone);
                updateInput.targetDate = adjusted;
              } else {
                // Fallback: no timezone information, adjust on the raw Date object
                const adjusted = new Date(scheduleData.targetDate);
                adjusted.setHours(hours, minutes, 0, 0);
                updateInput.targetDate = adjusted;
              }
            } else {
              // No explicit time in change and no existing time - use targetDate as-is
              updateInput.targetDate = scheduleData.targetDate;
              if (scheduleData.time) {
                updateInput.time = scheduleData.time;
              }
            }
          }
          
          // For yearly reminders (especially birthdays), update month and dayOfMonth
          if (reminder.frequency === 'yearly' || reminder.category === 'Birthdays') {
            const monthPattern = `(${ActionExecutor.MONTH_NAMES.join('|')}|${ActionExecutor.MONTH_ABBREVIATIONS.join('|')})`;
            
            // Try pattern 1: "23th December" or "on the 23rd of December" or "on 23th December"
            let dateMatch = parsed.newName.match(new RegExp(`(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of\\s+)?\\s+${monthPattern}`, 'i'));
            let dayNum: number | undefined;
            let monthName: string | undefined;
            
            if (dateMatch && dateMatch[1] && dateMatch[2]) {
              // Pattern 1: "23th December" - dateMatch[1] = day, dateMatch[2] = month
              dayNum = parseInt(dateMatch[1], 10);
              monthName = dateMatch[2].toLowerCase();
            } else {
              // Try pattern 2: "December 23rd"
              dateMatch = parsed.newName.match(new RegExp(`${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
              if (dateMatch && dateMatch[1] && dateMatch[2]) {
                // Pattern 2: "December 23rd" - dateMatch[1] = month, dateMatch[2] = day
                monthName = dateMatch[1].toLowerCase();
                dayNum = parseInt(dateMatch[2], 10);
              }
            }
            
            // If no explicit month name found, extract from targetDate or calculate from daysFromNow
            if (!monthName && timezone) {
              let targetDateToUse: Date | undefined;
              
              if (scheduleData.targetDate) {
                targetDateToUse = scheduleData.targetDate;
              } else if (scheduleData.daysFromNow !== undefined) {
                // Calculate target date from daysFromNow
                const currentTime = this.getCurrentTimeInTimezone(timezone);
                const targetDate = new Date(currentTime.year, currentTime.month, currentTime.day + scheduleData.daysFromNow);
                targetDateToUse = targetDate;
              }
              
              if (targetDateToUse) {
                const targetDateInUserTz = new Date(targetDateToUse.toLocaleString('en-US', { timeZone: timezone }));
                dayNum = targetDateInUserTz.getDate();
                const monthIndex = targetDateInUserTz.getMonth(); // 0-indexed (0-11)
                monthName = ActionExecutor.MONTH_NAMES[monthIndex]; // Convert to month name
                
                logger.info(
                  {
                    userId: this.userId,
                    reminderId: reminder.id,
                    extractedFromTargetDate: true,
                    dayNum,
                    monthIndex,
                    monthName,
                    targetDate: targetDateToUse,
                    daysFromNow: scheduleData.daysFromNow,
                  },
                  'Extracted month and day from targetDate/daysFromNow for yearly reminder update'
                );
              }
            }
            
            // Normalize month name (handle abbreviations)
            if (monthName) {
              const abbrIndex = monthAbbrs.indexOf(monthName);
              if (abbrIndex !== -1) {
                monthName = ActionExecutor.MONTH_NAMES[abbrIndex];
              }
            }
            
            if (monthName && dayNum !== undefined && dayNum >= 1 && dayNum <= 31 && monthNames.includes(monthName)) {
              const monthIndex = monthNames.indexOf(monthName);
              if (monthIndex !== -1) {
                updateInput.dayOfMonth = dayNum;
                updateInput.month = monthIndex + 1; // 1-12
                updateInput.frequency = 'yearly'; // Ensure it's yearly
                
                logger.info(
                  {
                    userId: this.userId,
                    reminderId: reminder.id,
                    parsedDay: dayNum,
                    parsedMonth: monthName,
                    monthIndex: monthIndex + 1,
                    updateInput,
                  },
                  'Successfully parsed birthday date update'
                );
              }
            }
          }
        }
        } // End of !isTitleOnlyChange block - skip time/date processing for title-only changes
        
        // Check for title changes
        // If changes contains "title" or "rename", extract the new title
        // OR if changes doesn't contain any date/time keywords, treat it as a title change
        
        // CRITICAL: Check for title changes FIRST, before any other processing
        // This ensures title extraction always works when "title" or "rename" keywords are present
        if (changes.includes('title') || changes.includes('rename')) {
          // Match patterns like "title to Pick up the son" or "rename to New title"
          // Use greedy match to capture everything after "title to" or "to" until end of string
          let titleMatch = parsed.newName.match(/title\s+to\s+(.+)$/i);
          if (!titleMatch) {
            titleMatch = parsed.newName.match(/rename\s+to\s+(.+)$/i);
          }
          if (!titleMatch) {
            // Fallback: match "to [title]" pattern (everything after "to")
            // But only if "title" or "rename" keyword is present to avoid false matches
            titleMatch = parsed.newName.match(/to\s+(.+)$/i);
          }
          if (titleMatch && titleMatch[1]) {
            const extractedTitle = titleMatch[1].trim();
            updateInput.title = extractedTitle;
            logger.info(
              {
                userId: this.userId,
                reminderId: reminder.id,
                parsedNewName: parsed.newName,
                extractedTitle: extractedTitle,
                extractedTitleLength: extractedTitle.length,
                titleMatchIndex: titleMatch.index,
                titleMatchFull: titleMatch[0],
                titleMatchGroup1: titleMatch[1],
              },
              'Extracted title from "title to" or "rename to" pattern'
            );
            
            // CRITICAL: Ensure the title is actually set and not empty
            if (!updateInput.title || updateInput.title.length === 0) {
              logger.error(
                {
                  userId: this.userId,
                  reminderId: reminder.id,
                  parsedNewName: parsed.newName,
                  extractedTitle: extractedTitle,
                  titleMatch: titleMatch,
                },
                'ERROR: Extracted title is empty after trim - this should not happen'
              );
            }
          } else {
            // If regex didn't match, log for debugging
            logger.warn(
              {
                userId: this.userId,
                reminderId: reminder.id,
                parsedNewName: parsed.newName,
                changes,
                parsedNewNameLength: parsed.newName?.length,
              },
              'Title keyword found but regex did not match - this should not happen'
            );
          }
        } else if (isTitleOnlyChange) {
          // If no date/time keywords are present and no schedule change, treat the entire changes string as a new title
          // This handles cases like "change 6 to pick up the son" where the AI outputs "to: Pick up the son"
          updateInput.title = parsed.newName.trim();
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              newTitle: updateInput.title,
              changes,
              isTitleOnlyChange,
            },
            'Detected title-only change (no date/time keywords)'
          );
        }
      }

      // CRITICAL: Log the updateInput before database update to debug title truncation
      if (updateInput.title) {
        logger.info(
          {
            userId: this.userId,
            reminderId: reminder.id,
            updateInputTitle: updateInput.title,
            updateInputTitleLength: updateInput.title.length,
            updateInputKeys: Object.keys(updateInput),
          },
          'About to update reminder with title'
        );
      }

      const updated = await updateReminder(this.db, reminder.id, this.userId, updateInput);
      
      // CRITICAL: Log the updated reminder after database update to verify title was saved correctly
      if (updated && updated.title) {
        logger.info(
          {
            userId: this.userId,
            reminderId: updated.id,
            updatedTitle: updated.title,
            updatedTitleLength: updated.title.length,
          },
          'Reminder updated - verifying title was saved correctly'
        );
      }

      logger.info(
        {
          userId: this.userId,
          reminderId: updated.id,
          timezone,
          updatedFrequency: updated.frequency,
          updatedMonth: updated.month,
          updatedDayOfMonth: updated.dayOfMonth,
        },
        'Reminder updated'
      );

      // Calculate next occurrence date for the updated reminder
      let dateInfo = '';
      
      // For "once" frequency reminders with targetDate, format directly from targetDate
      if (updated.frequency === 'once' && updated.targetDate) {
        if (timezone) {
          // Format targetDate in user's timezone
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
          
          const parts = formatter.formatToParts(new Date(updated.targetDate));
          const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
          
          const day = parseInt(getPart('day'), 10);
          const month = parseInt(getPart('month'), 10) - 1; // 0-indexed
          const year = parseInt(getPart('year'), 10);
          
          // ⚠️ CRITICAL: Use updated.time if available (for time-only updates), otherwise use time from targetDate
          let hours: number;
          let minutes: number;
          if (updated.time) {
            const [h, m] = updated.time.split(':').map(Number);
            hours = h;
            minutes = m;
          } else {
            hours = parseInt(getPart('hour'), 10);
            minutes = parseInt(getPart('minute'), 10);
          }
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Get current date in user's timezone for comparison
          const timeComponents = this.getCurrentTimeInTimezone(timezone);
          const today = new Date(timeComponents.year, timeComponents.month, timeComponents.day);
          const tomorrow = new Date(timeComponents.year, timeComponents.month, timeComponents.day + 1);
          const nextDateInUserTz = new Date(year, month, day);
          
          let dateLabel = '';
          if (nextDateInUserTz.getTime() === today.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateInUserTz.getTime() === tomorrow.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const monthName = this.getMonthAbbreviation(month);
            dateLabel = `${day} ${monthName}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
          
          logger.info(
            {
              userId: this.userId,
              reminderId: updated.id,
              targetDate: updated.targetDate,
              dateInfo,
              timezone,
            },
            'Formatted dateInfo directly from targetDate for once reminder'
          );
        }
      }
      
      // For yearly reminders with month and dayOfMonth, use the stored values directly (no timezone conversion)
      if (!dateInfo && updated.frequency === 'yearly' && updated.month && updated.dayOfMonth) {
        const day = updated.dayOfMonth;
        const monthIndex = updated.month - 1; // Convert 1-12 to 0-11
        
        // Validate monthIndex is in valid range
        if (monthIndex < 0 || monthIndex > 11) {
          logger.error(
            {
              userId: this.userId,
              reminderId: updated.id,
              storedMonth: updated.month,
              monthIndex,
            },
            'CRITICAL: Invalid month index for yearly reminder update - falling back to timezone calculation'
          );
        } else {
          const monthName = this.getMonthAbbreviation(monthIndex);
          const time = updated.time || '09:00';
          dateInfo = `${day} ${monthName} ${time}`;
          
          logger.info(
            {
              userId: this.userId,
              reminderId: updated.id,
              day,
              monthIndex,
              monthName,
              time,
              dateInfo,
            },
            'Formatted yearly reminder update date from stored values'
          );
        }
      }
      
      // Fallback: Use timezone-based calculation if yearly reminder doesn't have month/dayOfMonth or if not yearly
      if (!dateInfo && timezone) {
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
          // Format the next occurrence date using Intl.DateTimeFormat to get correct timezone components
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
          
          const parts = formatter.formatToParts(nextOccurrence);
          const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
          
          const day = parseInt(getPart('day'), 10);
          const month = parseInt(getPart('month'), 10) - 1; // Convert to 0-indexed
          const year = parseInt(getPart('year'), 10);
          const hours = parseInt(getPart('hour'), 10);
          const minutes = parseInt(getPart('minute'), 10);
          const time24 = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
          
          // Determine if it's today, tomorrow, or a specific date
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          // Create date objects for comparison (in user's timezone)
          const nextDateInUserTz = new Date(year, month, day);
          const todayInUserTz = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day);
          const tomorrowInUserTz = new Date(userLocalTime.year, userLocalTime.month, userLocalTime.day + 1);
          
          let dateLabel = 'Today';
          if (nextDateInUserTz.getTime() === todayInUserTz.getTime()) {
            dateLabel = 'Today';
          } else if (nextDateInUserTz.getTime() === tomorrowInUserTz.getTime()) {
            dateLabel = 'Tomorrow';
          } else {
            const monthName = this.getMonthAbbreviation(month);
            dateLabel = `${day} ${monthName}`;
          }
          
          dateInfo = `${dateLabel} ${time24}`;
        }
      }
      
      // If there's no specific date but we have a time, show it explicitly
      const timeLine = !dateInfo && updated.time ? `\nTime: ${updated.time}` : '';

      // Frequency / schedule info
      let frequencyLine = '';
      if (updated.frequency) {
        const frequencyLabels: Record<string, string> = {
          'daily': 'Daily',
          'hourly': 'Hourly',
          'minutely': 'Every N minutes',
          'once': 'Once',
          'weekly': 'Weekly',
          'monthly': 'Monthly',
          'yearly': 'Yearly',
        };
        let freqLabel = frequencyLabels[updated.frequency] || (updated.frequency.charAt(0).toUpperCase() + updated.frequency.slice(1));
        
        // For weekly reminders, append days of the week if specified
        if (updated.frequency === 'weekly' && updated.daysOfWeek && updated.daysOfWeek.length > 0) {
          const dayAbbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          // Sort days to display them in order (Monday first, then Tuesday, etc., with Sunday last)
          const sortedDays = [...updated.daysOfWeek].sort((a, b) => {
            // Sort: Monday (1) through Saturday (6) first, then Sunday (0) last
            if (a === 0) return 1; // Sunday goes to end
            if (b === 0) return -1;
            return a - b;
          });
          const dayNames = sortedDays.map(day => dayAbbreviations[day]).join(', ');
          freqLabel = `Weekly(${dayNames})`;
        }
        
        frequencyLine = `\nFrequency: ${freqLabel}`;
      }

      // Message header is bold - reminder title is NOT bold
      const responseMessage =
        `⚠️ *Reminder Updated:*\n` +
        `Title: ${updated.title || reminder.title}` +
        `${dateInfo ? `\nNew Date: ${dateInfo}` : ''}` +
        `${timeLine}` +
        `${frequencyLine}`;

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

  /**
   * Check if a reminder is passed/expired (its date/time has already occurred)
   * For one-time reminders: check if the target date has passed
   * For recurring reminders: they are never "passed" since they repeat
   */
  private isReminderPassed(reminder: any, userTimezone?: string): boolean {
    try {
      if (!userTimezone) {
        return false; // Can't determine without timezone
      }

      // Only one-time reminders can be "passed"
      if (reminder.frequency !== 'once') {
        return false; // Recurring reminders are never "passed" since they repeat
      }

      const now = new Date();
      const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
      const userLocalTime = {
        year: nowInTz.getFullYear(),
        month: nowInTz.getMonth(),
        day: nowInTz.getDate(),
        hours: nowInTz.getHours(),
        minutes: nowInTz.getMinutes(),
        seconds: nowInTz.getSeconds(),
        date: nowInTz,
      };

      // For one-time reminders, check if targetDate has passed
      if (reminder.targetDate) {
        const targetDate = new Date(reminder.targetDate);
        const targetInTz = new Date(targetDate.toLocaleString("en-US", { timeZone: userTimezone }));
        // Check if the date has passed (with time consideration)
        return targetInTz < userLocalTime.date;
      }

      // If no targetDate but has daysFromNow, calculate if it has passed
      if (reminder.daysFromNow !== undefined && reminder.daysFromNow !== null) {
        const createdAt = (reminder as any).createdAt ? new Date((reminder as any).createdAt) : userLocalTime.date;
        const createdInTz = new Date(createdAt.toLocaleString("en-US", { timeZone: userTimezone }));
        const targetDate = new Date(createdInTz);
        targetDate.setDate(targetDate.getDate() + reminder.daysFromNow);
        
        // If time is specified, add it to the target date
        if (reminder.time) {
          const [hours, minutes] = reminder.time.split(':').map(Number);
          targetDate.setHours(hours, minutes, 0, 0);
        }
        
        return targetDate < userLocalTime.date;
      }

      return false;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if reminder is passed');
      return false;
    }
  }

  /**
   * Check if a reminder is old (created more than 30 days ago)
   */
  private isReminderOld(reminder: any): boolean {
    try {
      const createdAt = (reminder as any).createdAt ? new Date((reminder as any).createdAt) : null;
      if (!createdAt) {
        return false;
      }
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff > 30;
    } catch (error) {
      logger.error({ error, reminderId: reminder.id }, 'Error checking if reminder is old');
      return false;
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

      const taskNameLower = parsed.taskName.toLowerCase().trim();

      // Handle bulk deletion by status (with or without "all")
      const isBulkDelete = (
        taskNameLower.includes('passed') ||
        taskNameLower.includes('expired') ||
        taskNameLower.includes('old') ||
        taskNameLower.includes('paused')
      ) && (
        taskNameLower.includes('all') ||
        taskNameLower === 'passed' ||
        taskNameLower === 'expired' ||
        taskNameLower === 'old' ||
        taskNameLower === 'paused' ||
        taskNameLower === 'passed reminders' ||
        taskNameLower === 'expired reminders' ||
        taskNameLower === 'old reminders' ||
        taskNameLower === 'paused reminders'
      );

      if (isBulkDelete) {
        const allReminders = await getRemindersByUserId(this.db, this.userId);
        
        if (allReminders.length === 0) {
          return {
            success: false,
            message: "You don't have any reminders to delete.",
          };
        }

        // Get user timezone for passed/expired checks
        const user = await getUserById(this.db, this.userId);
        const userTimezone = user?.timezone || 'UTC';

        let remindersToDelete: any[] = [];
        let filterType = '';

        if (taskNameLower.includes('paused')) {
          remindersToDelete = allReminders.filter(r => !r.active);
          filterType = 'paused';
        } else if (taskNameLower.includes('passed') || taskNameLower.includes('expired')) {
          remindersToDelete = allReminders.filter(r => this.isReminderPassed(r, userTimezone));
          filterType = taskNameLower.includes('expired') ? 'expired' : 'passed';
        } else if (taskNameLower.includes('old')) {
          remindersToDelete = allReminders.filter(r => this.isReminderOld(r));
          filterType = 'old';
        }

        if (remindersToDelete.length === 0) {
          return {
            success: false,
            message: `You don't have any ${filterType} reminders to delete.`,
          };
        }

        // Delete filtered reminders
        for (const reminder of remindersToDelete) {
          await deleteReminder(this.db, reminder.id, this.userId);
        }

        logger.info({ userId: this.userId, count: remindersToDelete.length, filterType }, `Bulk deleted ${filterType} reminders`);

        const filterLabel = filterType === 'paused' ? 'Paused' : filterType === 'expired' ? 'Expired' : filterType === 'passed' ? 'Passed' : 'Old';
        return {
          success: true,
          message: `⛔ *All ${filterLabel} Reminders Deleted:*\nDeleted ${remindersToDelete.length} reminder${remindersToDelete.length === 1 ? '' : 's'}.`,
        };
      }

      // Support number-based deletion using last reminders list context
      const numberTokens = parsed.taskName
        .split(/[\s,]+|and/i)
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => parseInt(t, 10))
        .filter(n => !isNaN(n) && n > 0);

      if (numberTokens.length > 0) {
        const listContext = this.getListContext();
        if (listContext && listContext.type === 'reminder') {
          const targets = listContext.items.filter(item => numberTokens.includes(item.number));
          if (targets.length > 0) {
            for (const target of targets) {
              await deleteReminder(this.db, target.id, this.userId);
              logger.info({ userId: this.userId, reminderId: target.id, reminderNumber: target.number }, 'Reminder deleted by number');
            }
            const titles = targets.map(t => t.name ?? 'Reminder');
            return {
              success: true,
              message: `⛔ *Reminders Deleted:*\n${titles.join(', ')}`,
            };
          }
        }
        // If context missing or no targets found, continue with title-based logic below
      }

      // Handle "delete all" case
      if (taskNameLower === 'all') {
        const allReminders = await getRemindersByUserId(this.db, this.userId);
        
        if (allReminders.length === 0) {
          return {
            success: false,
            message: "You don't have any reminders to delete.",
          };
        }

        // Delete all reminders
        for (const reminder of allReminders) {
          await deleteReminder(this.db, reminder.id, this.userId);
        }

        logger.info({ userId: this.userId, count: allReminders.length }, 'All reminders deleted');

        return {
          success: true,
          message: `⛔ *All Reminders Deleted:*\nDeleted ${allReminders.length} reminder${allReminders.length === 1 ? '' : 's'}.`,
        };
      }

      // Find reminder by title
      const reminders = await getRemindersByUserId(this.db, this.userId);
      const rawName = parsed.taskName!.trim().toLowerCase();
      
      // ⚠️ CRITICAL: Check if this is a generic reminder name (e.g., "Reminder", "Reminder-1", "Reminder-2")
      // If so, prioritize the MOST RECENTLY CREATED reminder
      const isGenericName =
        rawName === 'reminder' ||
        rawName === 'a reminder' ||
        rawName === 'this reminder' ||
        rawName === 'that reminder' ||
        rawName === 'it' ||
        /^reminder-\d+$/i.test(rawName) || // Matches "Reminder-1", "Reminder-2", etc.
        /^reminder\s*\d*$/i.test(rawName); // Matches "Reminder", "Reminder 1", etc.

      let reminder: any = null;
      
      if (isGenericName && reminders.length > 0) {
        // Sort by creation date (newest first) and use the most recent one
        reminder = [...reminders].sort((a, b) => {
          const aCreated = new Date(a.createdAt as any).getTime();
          const bCreated = new Date(b.createdAt as any).getTime();
          return bCreated - aCreated; // newest first
        })[0];
        
        logger.info(
          {
            userId: this.userId,
            reminderId: reminder.id,
            reminderTitle: reminder.title,
            parsedTaskName: parsed.taskName,
            totalReminders: reminders.length,
          },
          'Using most recently created reminder for generic name (delete)'
        );
      } else {
        // Try to find by exact or partial title match
        const matchingReminders = reminders.filter(r => 
        r.title.toLowerCase().includes(parsed.taskName!.toLowerCase()) ||
        parsed.taskName!.toLowerCase().includes(r.title.toLowerCase())
      );
        
        if (matchingReminders.length === 0) {
          reminder = null;
        } else if (matchingReminders.length === 1) {
          // Single match - use it
          reminder = matchingReminders[0];
        } else {
          // Multiple matches - prioritize the MOST RECENTLY CREATED reminder
          reminder = [...matchingReminders].sort((a, b) => {
            const aCreated = new Date(a.createdAt as any).getTime();
            const bCreated = new Date(b.createdAt as any).getTime();
            return bCreated - aCreated; // newest first
          })[0];
          
          logger.info(
            {
              userId: this.userId,
              reminderId: reminder.id,
              reminderTitle: reminder.title,
              parsedTaskName: parsed.taskName,
              totalMatches: matchingReminders.length,
              allMatches: matchingReminders.map(r => ({ id: r.id, title: r.title, createdAt: r.createdAt })),
            },
            'Multiple reminders matched, using most recently created one (delete)'
          );
        }
      }

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
      // Pattern: "4th december", "4 december", "december 4", "december 4th", "4th dec", "dec 4", etc.
      for (let i = 0; i < ActionExecutor.MONTH_NAMES.length; i++) {
        const monthName = ActionExecutor.MONTH_NAMES[i];
        const monthAb = ActionExecutor.MONTH_ABBREVIATIONS[i];
        
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
            
            // Use current year for the date (allow past dates - don't automatically move to next year)
            let targetDate = new Date(currentYear, i, dayNum);
            
            // Check if the date is valid (handles cases like Feb 30)
            if (targetDate.getDate() === dayNum) {
              // Allow past dates - use the date as specified by the user
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
            
            // Use current month (allow past dates - don't automatically move to next month)
            let targetDate = new Date(currentYear, now.getMonth(), dayNum);
            if (targetDate.getDate() === dayNum) {
              // Allow past dates - use the date as specified by the user
              const year = targetDate.getFullYear();
              const month = String(targetDate.getMonth() + 1).padStart(2, '0');
              const day = String(targetDate.getDate()).padStart(2, '0');
                parsedDate = `${year}-${month}-${day}`;
              }
            }
          }
      }
      
      // Check if timeframe is just a month name (without day number)
      let monthOnlyDate: string | undefined;
      if (!parsedDate) {
        // Check if the timeframe is just a month name (e.g., "February", "feb", "february")
        const monthOnlyMatch = timeframeLower.match(/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/);
        if (monthOnlyMatch) {
          const monthName = monthOnlyMatch[1];
          let monthIndex = -1;
          
          // Find month index
          if (monthNames.includes(monthName)) {
            monthIndex = monthNames.indexOf(monthName);
          } else if (monthAbbr.includes(monthName)) {
            monthIndex = monthAbbr.indexOf(monthName);
          }
          
          if (monthIndex >= 0) {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            
            // If the requested month is in the past (e.g., it's March and user asks for February),
            // use next year. Otherwise use current year.
            let targetYear = currentYear;
            if (monthIndex < currentMonth) {
              targetYear = currentYear + 1;
            }
            
            // Create start and end dates for the month
            const monthStart = new Date(targetYear, monthIndex, 1);
            const monthEnd = new Date(targetYear, monthIndex + 1, 0, 23, 59, 59, 999);
            
            // Format as date range - use start date for filtering
            const year = monthStart.getFullYear();
            const month = String(monthStart.getMonth() + 1).padStart(2, '0');
            const day = String(monthStart.getDate()).padStart(2, '0');
            monthOnlyDate = `${year}-${month}-${day}`;
            
            // Store end date for filtering (we'll need to pass this to calendar service)
            // For now, we'll use startDate and let calendar service handle the range
            logger.info(
              {
                userId: this.userId,
                originalTimeframe: timeframe,
                monthName,
                monthIndex,
                targetYear,
                monthStart: monthStart.toISOString(),
                monthEnd: monthEnd.toISOString(),
                monthOnlyDate,
              },
              'Parsed month-only timeframe'
            );
          }
        }
      }
      
      // Check if timeframe is "this year" - need to set date range for entire year
      let yearOnlyDate: string | undefined;
      let yearEndDate: string | undefined;
      if (!parsedDate && !monthOnlyDate) {
        if (timeframeLower.includes('this year') || timeframeLower === 'this year' || timeframeLower.includes('for this year') || timeframeLower.includes('in this year')) {
          const now = new Date();
          const currentYear = now.getFullYear();
          
          // Set start date to January 1st of current year
          yearOnlyDate = `${currentYear}-01-01`;
          // Set end date to December 31st of current year
          yearEndDate = `${currentYear}-12-31`;
          
          logger.info(
            {
              userId: this.userId,
              originalTimeframe: timeframe,
              currentYear,
              yearOnlyDate,
              yearEndDate,
            },
            'Parsed "this year" timeframe'
          );
        }
      }
      
      // Map timeframe strings to queryTimeframe values (if not a specific date)
      let queryTimeframe: 'today' | 'tomorrow' | 'this_week' | 'this_month' | 'all' | undefined;
      
      if (parsedDate || monthOnlyDate || yearOnlyDate) {
        // Specific date, month, or year found, don't set queryTimeframe
        queryTimeframe = undefined;
        // Use yearOnlyDate if available, otherwise monthOnlyDate, otherwise parsedDate
        if (yearOnlyDate && !parsedDate && !monthOnlyDate) {
          parsedDate = yearOnlyDate;
        } else if (monthOnlyDate && !parsedDate) {
          parsedDate = monthOnlyDate;
        }
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
        ...(yearEndDate ? { endDate: yearEndDate } : {}),
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
        
        // Determine header based on timeframe or infer from events
        // Use calendar timezone for date comparisons
        const now = new Date();
        
        // Get today's date in calendar timezone
        const todayStr = now.toLocaleDateString('en-US', {
          timeZone: calendarTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const todayParts = todayStr.split('/');
        const today = new Date(parseInt(todayParts[2] || '2024', 10), parseInt(todayParts[0] || '1', 10) - 1, parseInt(todayParts[1] || '1', 10));
        
        // Check if all events are today (in calendar timezone)
        const allToday = result.events.every((event: any) => {
          const eventDate = new Date(event.start);
          const eventDateStr = eventDate.toLocaleDateString('en-US', {
            timeZone: calendarTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          return eventDateStr === todayStr;
        });
        
        // Check if all events are tomorrow (in calendar timezone)
        const tomorrowDate = new Date(today);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toLocaleDateString('en-US', {
          timeZone: calendarTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const allTomorrow = result.events.every((event: any) => {
          const eventDate = new Date(event.start);
          const eventDateStr = eventDate.toLocaleDateString('en-US', {
            timeZone: calendarTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
          return eventDateStr === tomorrowStr;
        });
        
        let headerText = "Events:";
        // Prioritize queryTimeframe over inferred dates
        if (queryTimeframe === 'this_week') {
          headerText = `📅 *Events This Week*`;
        } else if (queryTimeframe === 'tomorrow') {
          headerText = `📅 *Tomorrow's Events:*`;
        } else if (queryTimeframe === 'today') {
          headerText = `📅 *Today's Events:*`;
        } else if (allToday) {
          // Fallback: infer from events if no explicit timeframe
          headerText = `📅 *Today's Events:*`;
        } else if (allTomorrow) {
          // Fallback: infer from events if no explicit timeframe
          headerText = `📅 *Tomorrow's Events:*`;
        } else {
          headerText = `📅 *Events:*`;
        }
        
        let message = `${headerText}\n\n`;
        
        // Format each event using calendar's timezone
        result.events.slice(0, 20).forEach((event: { title: string; start: Date; location?: string }, index: number) => {
          const eventStart = new Date(event.start);
          
          // Format time as 24-hour format (e.g., "15:00") in bold
          const eventTime24 = eventStart.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: calendarTimezone,
          });
          
          // Format date as "Sat, 3 Jan" (short weekday, day, short month)
          // We need to manually format to get "day month" order instead of "month day"
          const dateParts = eventStart.toLocaleDateString('en-US', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: calendarTimezone,
          }).split(', ');
          const weekday = dateParts[0] || '';
          const monthDay = dateParts[1] || '';
          // Split monthDay to get month and day separately, then reorder
          const monthDayParts = monthDay.split(' ');
          const month = monthDayParts[0] || '';
          const day = monthDayParts[1] || '';
          const eventDate = `${weekday}, ${day} ${month}`;
          
          // Format: Numbered list, title on one line, date and time on next line (indented)
          message += `*${index + 1}*. ${event.title || 'Untitled Event'}\n${eventDate} | *${eventTime24}*\n\n`;
        });
        
        if (result.events.length > 20) {
          message += `\n... and ${result.events.length - 20} more event${result.events.length - 20 !== 1 ? 's' : ''}.`;
        }
        
        // Store event list context for number-based operations (e.g., "show me 2")
        const eventCalendarId = calendarConnection.calendarId || calendarConnection.email || 'primary';
        const displayedEvents = result.events.slice(0, 20).map((event: any, index: number) => ({
          id: event.id,
          number: index + 1,
          name: event.title,
          calendarId: eventCalendarId,
        }));
        this.storeListContext('event', displayedEvents);
        
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
   * Show event details/overview for a specific event
   */
  private async showEventDetails(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      // Check calendar connection first
      const calendarConnection = await getPrimaryCalendar(this.db, this.userId);
      
      if (!calendarConnection) {
        logger.warn({ userId: this.userId }, 'No calendar connection found for event details');
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

      // Get calendar timezone for formatting
      let calendarTimezone = 'Africa/Johannesburg'; // Default fallback
      try {
        const calendarService = new CalendarService(this.db);
        if (calendarConnection) {
          calendarTimezone = await (calendarService as any).getUserTimezone(this.userId, calendarConnection);
        }
      } catch (error) {
        logger.warn({ error, userId: this.userId }, 'Failed to get calendar timezone for event formatting, using default');
      }

      const calendarService = new CalendarService(this.db);
      
      // Use the calendar connection we already have
      let calendarId = calendarConnection.calendarId || calendarConnection.email || 'primary';
      
      // Try to find the event - could be by number, name, or ID
      let event: any = null;
      let eventId: string | undefined;

      // Get the action text (could be in parsed.action or parsed.taskName)
      // For event details, taskName contains the event name/number
      const actionText = parsed.taskName || parsed.action || '';
      
      logger.info({ userId: this.userId, actionText, calendarId, parsedAction: parsed.action, parsedTaskName: parsed.taskName }, 'Searching for event');

      // Check if user specified an event number (e.g., "event 1", "show me 1", "2")
      const eventNumberMatch = actionText.match(/(?:event|#|number)\s*(\d+)/i) || 
                               actionText.match(/^(\d+)$/);
      if (eventNumberMatch && eventNumberMatch[1]) {
        const eventNumber = parseInt(eventNumberMatch[1], 10);
        
        // First, check if there's a cached event list context
        const listContext = this.getListContext();
        if (listContext && listContext.type === 'event' && listContext.items.length > 0) {
          const cachedEvent = listContext.items.find(item => item.number === eventNumber);
          if (cachedEvent && cachedEvent.id) {
            logger.info({ userId: this.userId, eventNumber, cachedEventId: cachedEvent.id, cachedCalendarId: cachedEvent.calendarId }, 'Using cached event from list context');
            eventId = cachedEvent.id;
            if (cachedEvent.calendarId) {
              calendarId = cachedEvent.calendarId;
            }
          }
        }
        
        // If not found in cache, query all events
        if (!eventId) {
          const eventIndex = eventNumber - 1; // Convert to 0-based index
          
          // Get events list first
          const intent: CalendarIntent = {
            action: 'QUERY',
            confidence: 0.9,
            queryTimeframe: 'all',
          };
          
          const queryResult = await calendarService.query(this.userId, intent);
          if (queryResult.success && queryResult.events && queryResult.events.length > eventIndex && eventIndex >= 0) {
            event = queryResult.events[eventIndex];
            eventId = event.id;
          }
        }
      } else if (actionText) {
        // Try to find event by name/title
        const intent: CalendarIntent = {
          action: 'QUERY',
          confidence: 0.9,
          title: actionText,
          queryTimeframe: 'all',
        };
        
        logger.info({ userId: this.userId, searchTitle: actionText }, 'Querying events by title');
        const queryResult = await calendarService.query(this.userId, intent);
        
        logger.info({ 
          userId: this.userId, 
          success: queryResult.success, 
          eventCount: queryResult.events?.length || 0,
          foundEvents: queryResult.events?.map((e: any) => ({ id: e.id, title: e.title })) || []
        }, 'Event query result');
        
        if (queryResult.success && queryResult.events && queryResult.events.length > 0) {
          // Use the first matching event
          event = queryResult.events[0];
          eventId = event.id;
          logger.info({ userId: this.userId, eventId, eventTitle: event.title }, 'Found event by title');
        } else {
          logger.warn({ userId: this.userId, searchTitle: actionText }, 'No events found matching title');
        }
      }

      if (!eventId) {
        logger.warn({ userId: this.userId, actionText, hasEvent: !!event, hasEventId: !!eventId }, 'Event not found');
        return {
          success: false,
          message: `I couldn't find an event matching "${actionText}". Please check the event name or try using the event number.`,
        };
      }

      // Get full event details
      logger.info({ userId: this.userId, calendarId, eventId }, 'Getting full event details');
      const eventDetailsResult = await calendarService.getEvent(this.userId, calendarId, eventId);
      
      if (!eventDetailsResult.success || !eventDetailsResult.event) {
        return {
          success: false,
          message: "I couldn't retrieve the event details. Please try again.",
        };
      }

      const fullEvent = eventDetailsResult.event as any;
      const eventStart = new Date(fullEvent.start);

      // Format time as 24-hour format (e.g., "13:40")
      const eventTime = eventStart.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: calendarTimezone,
      });

      // Format date as "3 Jan" (day month) - manually format to ensure correct order
      const dateStr = eventStart.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        timeZone: calendarTimezone,
      });
      // Split and reorder: "Jan 3" -> ["Jan", "3"] -> "3 Jan"
      const dateParts = dateStr.split(' ');
      const month = dateParts[0] || '';
      const day = dateParts[1] || '';
      const eventDate = `${day} ${month}`;

      // Format attendees - extract names from emails if possible
      let attendeeNames: string[] = [];
      if (fullEvent.attendees && fullEvent.attendees.length > 0) {
        attendeeNames = fullEvent.attendees.map((attendee: string) => {
          if (attendee.includes('@')) {
            const namePart = attendee.split('@')[0];
            if (namePart) {
              return namePart.split('.').map((part: string) =>
                part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
              ).join(' ');
            }
          }
          return attendee;
        });
      }

      // Build Event Overview message - matching create event style with button
      let messageBody = `📅 *Event Overview*\n\n`;
      messageBody += `*Title:* ${fullEvent.title || 'Untitled Event'}\n`;
      messageBody += `*Date:* ${eventDate}\n`;
      messageBody += `*Time:* ${eventTime}\n`;

      // Determine what to show in Location field:
      // - If location/address exists: show location name (not URL)
      // - If no location OR Google Meet requested: show Google Meet link
      let buttonUrl: string | null = null;
      let buttonText: string = '';

      if (fullEvent.location) {
        // User provided location/address - show location name, button will have Google Maps link
        const mapsLink = await this.getGoogleMapsLinkForLocation(fullEvent.location);
        messageBody += `*Location:* ${fullEvent.location}\n`;
        if (mapsLink) {
          buttonUrl = mapsLink;
          buttonText = 'Open in Google Maps';
        }
        } else if (fullEvent.conferenceUrl) {
          // No location but Google Meet exists - show "No location"
          messageBody += `*Location:* No location\n`;
          buttonUrl = fullEvent.conferenceUrl;
          buttonText = 'Google Meet';
        }

      // Attendees
      if (attendeeNames.length > 0) {
        messageBody += `*Invited:* ${attendeeNames.join(', ')}\n`;
      }

      // Send as CTA button message if we have a button, otherwise send as text
      if (buttonUrl && buttonText) {
        await this.sendSingleButtonMessage(messageBody, buttonText, buttonUrl);
      } else {
        await this.whatsappService.sendTextMessage(this.recipient, messageBody);
      }

      return {
        success: true,
        message: '', // Empty since we already sent the message with buttons
      };
    } catch (error) {
      logger.error({ error, userId: this.userId, action: parsed.action }, 'Failed to show event details');
      return {
        success: false,
        message: "I'm sorry, I couldn't retrieve the event details. Please try again.",
      };
    }
  }

  /**
   * Helper function to send a single CTA button message
   */
  private async sendSingleButtonMessage(
    bodyText: string,
    buttonText: string,
    buttonUrl: string
  ): Promise<void> {
    try {
      await this.whatsappService.sendCTAButtonMessage(this.recipient, {
        bodyText: bodyText,
        buttonText: buttonText,
        buttonUrl: buttonUrl,
      });
      // Log button message
      try {
        const whatsappNumber = await getVerifiedWhatsappNumberByPhone(this.db, this.recipient);
        if (whatsappNumber) {
          await logOutgoingWhatsAppMessage(this.db, {
            whatsappNumberId: whatsappNumber.id,
            userId: this.userId,
            messageType: 'interactive',
            messageContent: `Button: ${buttonText} - ${buttonUrl}`,
            isFreeMessage: true,
          });
        }
      } catch (logError) {
        logger.warn({ error: logError, userId: this.userId }, 'Failed to log outgoing button message');
      }
    } catch (error) {
      logger.warn({ error, userId: this.userId, buttonUrl }, `Failed to send button message, falling back to text: ${buttonText}`);
      await this.whatsappService.sendTextMessage(this.recipient, `${bodyText}\n\n${buttonText}: ${buttonUrl}`);
    }
  }

  /**
   * Helper function to get Google Maps link for a location
   */
  private async getGoogleMapsLinkForLocation(location: string): Promise<string | null> {
    if (!location) return null;
    
    try {
      const addresses = await getUserAddresses(this.db, this.userId);
      
      // Try to find matching address by name or full address
      const locationLower = location.toLowerCase().trim();
      
      for (const address of addresses) {
        // Check if location matches address name
        if (address.name.toLowerCase().trim() === locationLower) {
          // Build Google Maps link from coordinates or address
          if (address.latitude != null && address.longitude != null) {
            return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
          } else {
            // Build full address string
            const addressParts = [
              address.street,
              address.city,
              address.state,
              address.zip,
              address.country,
            ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
            
            if (addressParts.length > 0) {
              const fullAddress = addressParts.join(', ');
              return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`;
            }
          }
        }
        
        // Check if location matches full address
        const addressParts = [
          address.street,
          address.city,
          address.state,
          address.zip,
          address.country,
        ].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
        
        if (addressParts.length > 0) {
          const fullAddress = addressParts.join(', ').toLowerCase();
          if (fullAddress === locationLower || locationLower.includes(fullAddress) || fullAddress.includes(locationLower)) {
            if (address.latitude != null && address.longitude != null) {
              return `https://www.google.com/maps?q=${address.latitude},${address.longitude}`;
            } else {
              return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressParts.join(', '))}`;
            }
          }
        }
      }
      
      // If no match found, create Google Maps link from location string
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    } catch (error) {
      logger.warn({ error, userId: this.userId, location }, 'Failed to get Google Maps link for location');
      // Fallback: create Google Maps link from location string
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
    }
  }

  /**
   * Helper function to send Google Maps and Google Meet buttons together
   */
  private async sendEventLinkButtons(
    location: string | undefined,
    mapsLink: string | null,
    conferenceUrl: string | undefined
  ): Promise<void> {
    const buttons: Array<{ bodyText: string; buttonText: string; buttonUrl: string }> = [];
    
    // Prepare Google Maps button if available
    if (location && mapsLink) {
      buttons.push({
        bodyText: `📍 Location: ${location}`,
        buttonText: 'Open in Google Maps',
        buttonUrl: mapsLink,
      });
    }
    
    // Prepare Google Meet button if available
    if (conferenceUrl) {
      buttons.push({
        bodyText: '🔗 Join the meeting',
        buttonText: 'Join Google Meet',
        buttonUrl: conferenceUrl,
      });
    }
    
    // Send all buttons in quick succession so they appear together
    for (const button of buttons) {
      try {
        await this.whatsappService.sendCTAButtonMessage(this.recipient, button);
      } catch (error) {
        logger.warn({ error, userId: this.userId, buttonUrl: button.buttonUrl }, `Failed to send ${button.buttonText} button, falling back to text`);
        await this.whatsappService.sendTextMessage(this.recipient, `${button.bodyText}\n${button.buttonUrl}`);
      }
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
   * Recursively search for a category by name across all folders and categories
   * Note: Uses subfolders relation name from database, but represents categories for shopping lists
   */
  private async findNoteByName(noteName: string, folderRoute?: string | null) {
    const notes = await getUserNotes(this.db, this.userId, folderRoute ? { folderId: await this.resolveNoteFolderRoute(folderRoute) || undefined } : undefined);
    const noteNameLower = noteName.toLowerCase();
    return notes.find(n => n.title.toLowerCase() === noteNameLower) || null;
  }

  private async findNoteFolderByName(folderName: string) {
    const folders = await getUserNoteFolders(this.db, this.userId);
    const folderNameLower = folderName.toLowerCase();
    return folders.find(f => f.name.toLowerCase() === folderNameLower) || null;
  }

  private async resolveNoteFolderRoute(folderRoute: string): Promise<string | null> {
    const folders = await getUserNoteFolders(this.db, this.userId);
    const parts = folderRoute.split('/').map(p => p.trim()).filter(p => p);
    
    if (parts.length === 1) {
      const folder = folders.find(f => f.name.toLowerCase() === parts[0].toLowerCase());
      return folder ? folder.id : null;
    }
    
    // Multiple parts: navigate through subfolders
    let currentFolder = folders.find(f => f.name.toLowerCase() === parts[0].toLowerCase());
    if (!currentFolder) {
      return null;
    }

    for (let i = 1; i < parts.length; i++) {
      const subfolder = currentFolder.subfolders?.find((sf: any) => sf.name.toLowerCase() === parts[i].toLowerCase());
      if (!subfolder) {
        return null;
      }
      currentFolder = subfolder;
    }
    
    return currentFolder?.id || null;
  }

  private findSubfolderByName(folders: any[], folderName: string): any | null {
    for (const folder of folders) {
      // Check categories at this level (with fuzzy matching)
      if (folder.subfolders && folder.subfolders.length > 0) {
        const found = folder.subfolders.find(
          (sf: any) => this.folderNamesMatch(sf.name, folderName)
        );
        if (found) {
          return found;
        }
        
        // Recursively search deeper categories
        for (const category of folder.subfolders) {
          const deeperFound = this.findSubfolderByName([category], folderName);
          if (deeperFound) {
            return deeperFound;
          }
        }
      }
    }
    return null;
  }

  /**
   * Check if two folder names match, handling singular/plural variations
   */
  private folderNamesMatch(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    
    // Exact match
    if (n1 === n2) return true;
    
    // Helper function to get plural form
    const getPlural = (word: string): string => {
      // Words ending in 'y' preceded by a consonant -> 'ies'
      if (/[^aeiou]y$/i.test(word)) {
        return word.slice(0, -1) + 'ies';
      }
      // Words ending in 's', 'x', 'z', 'ch', 'sh' -> 'es'
      if (/[sxz]|[cs]h$/i.test(word)) {
        return word + 'es';
      }
      // Words ending in 'f' or 'fe' -> 'ves' (common cases)
      if (/f$/i.test(word)) {
        return word.slice(0, -1) + 'ves';
      }
      if (/fe$/i.test(word)) {
        return word.slice(0, -2) + 'ves';
      }
      // Default: add 's'
      return word + 's';
    };
    
    // Helper function to get singular form
    const getSingular = (word: string): string => {
      // Words ending in 'ies' -> 'y'
      if (/ies$/i.test(word)) {
        return word.slice(0, -3) + 'y';
      }
      // Words ending in 'ves' -> 'f' or 'fe'
      if (/ves$/i.test(word)) {
        const base = word.slice(0, -3);
        // Try 'f' first
        if (base.length > 0) {
          return base + 'f';
        }
      }
      // Words ending in 'es' (after s, x, z, ch, sh) -> remove 'es'
      if (/[sxz]es$|[cs]hes$/i.test(word)) {
        return word.slice(0, -2);
      }
      // Words ending in 's' -> remove 's'
      if (/s$/i.test(word)) {
        return word.slice(0, -1);
      }
      return word;
    };
    
    // Check if name1 is singular of name2
    const pluralOfN1 = getPlural(n1);
    if (pluralOfN1 === n2) return true;
    
    // Check if name2 is singular of name1
    const pluralOfN2 = getPlural(n2);
    if (pluralOfN2 === n1) return true;
    
    // Check if name1 is plural of name2
    const singularOfN1 = getSingular(n1);
    if (singularOfN1 === n2 && n1 !== n2) return true;
    
    // Check if name2 is plural of name1
    const singularOfN2 = getSingular(n2);
    if (singularOfN2 === n1 && n1 !== n2) return true;
    
    // Check if one contains the other (for partial matches like "grocery" in "grocery list")
    // Only allow if the shorter name is at least 4 characters to avoid false matches
    if (n1.includes(n2) || n2.includes(n1)) {
      const shorter = n1.length < n2.length ? n1 : n2;
      if (shorter.length >= 4) return true;
    }
    
    return false;
  }

  /**
   * Find folder by name with fuzzy matching (handles singular/plural)
   */
  private findFolderByName(folders: any[], folderName: string): any | null {
    const folderNameLower = folderName.toLowerCase().trim();
    
    // First try exact match
    let folder = folders.find(f => f.name.toLowerCase() === folderNameLower);
    if (folder) return folder;
    
    // Try fuzzy matching (singular/plural variations)
    folder = folders.find(f => this.folderNamesMatch(f.name, folderName));
    if (folder) return folder;
    
    return null;
  }

  /**
   * Resolve shopping list folder route (e.g., "Groceries" or "Groceries/Fruits") to folder ID
   * Similar to resolveFolderRoute but for shopping list folders
   * Handles singular/plural variations (e.g., "grocery" matches "Groceries")
   */
  private async resolveShoppingListFolderRoute(folderRoute: string): Promise<string | null> {
    const parts = folderRoute.split(/[\/→>]/).map(p => p.trim());
    const folders = await getUserShoppingListFolders(this.db, this.userId);
    const primaryFolder = await getPrimaryShoppingListFolder(this.db, this.userId);

    // If only one part is provided, search all categories recursively
    if (parts.length === 1) {
      const rawName = parts[0];
      const folderName = rawName.toLowerCase();

      // Special-case: treat common synonyms as the Home (primary) list
      if (
        primaryFolder &&
        (
          folderName === 'home' ||
          folderName === 'home list' ||
          folderName === 'my home list' ||
          folderName === 'shopping list' ||
          folderName === 'my shopping list'
        )
      ) {
        return primaryFolder.id;
      }
      
      // First check if it's a root folder (with fuzzy matching)
      const rootFolder = this.findFolderByName(folders, rawName);
      if (rootFolder) {
        return rootFolder.id;
      }
      
      // If not found as root folder, search all categories recursively
      const foundCategory = this.findSubfolderByName(folders, rawName);
      if (foundCategory) {
        return foundCategory.id;
      }
      
      return null;
    }
    
    // Multiple parts: use the original path-based approach
    // Find root folder (with fuzzy matching)
    let currentFolder = this.findFolderByName(folders, parts[0]);
    if (!currentFolder) {
      return null;
    }

    // Navigate through categories (with fuzzy matching)
    for (let i = 1; i < parts.length; i++) {
      const categoryName = parts[i];
      const category = currentFolder.subfolders?.find(
        sf => this.folderNamesMatch(sf.name, categoryName)
      );
      if (!category) {
        return null;
      }
      currentFolder = category;
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
        message: `⚠️ *Shopping Lists Folder Updated:*\n"${parsed.folderRoute}" → "${parsed.newName}"`,
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
        message: "I need to know which parent folder you'd like to create a category in. Please specify the parent folder name.",
      };
    }

    if (!parsed.newName) {
      return {
        success: false,
        message: "I need to know what you'd like to name the category. Please specify the category name.",
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
        message: `✅ *New Shopping List Category Created:*\nParent: ${parsed.folderRoute}\nName: ${parsed.newName}`,
      };
    } catch (error) {
      logger.error({ error, parentFolder: parsed.folderRoute, categoryName: parsed.newName, userId: this.userId }, 'Failed to create shopping list category');
      return {
        success: false,
        message: `I'm sorry, I couldn't create the category "${parsed.newName}" in "${parsed.folderRoute}". Please try again.`,
      };
    }
  }

  private async listShoppingListFolders(parsed: ParsedAction): Promise<{ success: boolean; message: string }> {
    try {
      const folders = await getUserShoppingListFolders(this.db, this.userId);
      
      // If a parent folder is specified, only show its categories
      if (parsed.folderRoute) {
        const parentFolderId = await this.resolveShoppingListFolderRoute(parsed.folderRoute);
        if (!parentFolderId) {
          return {
            success: false,
            message: `I couldn't find the folder "${parsed.folderRoute}". Please make sure the folder exists.`,
          };
        }

        // Find the parent folder and its categories
        const parentFolder = folders.find(f => f.id === parentFolderId);
        if (!parentFolder || !parentFolder.subfolders || parentFolder.subfolders.length === 0) {
          return {
            success: true,
            message: `📁 *No categories in "${parsed.folderRoute}"*`,
          };
        }

        let message = `📁 *Categories in "${parsed.folderRoute}":*\n`;
        parentFolder.subfolders.forEach((category: any, index: number) => {
          message += `*${index + 1}.* ${category.name}\n`;
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
        const categoryCount = folder.subfolders?.length || 0;
        const itemCount = folder.items?.length || 0;
        message += `*${index + 1}.* ${folder.name}`;
        if (categoryCount > 0 || itemCount > 0) {
          const details: string[] = [];
          if (categoryCount > 0) {
            details.push(`${categoryCount} categor${categoryCount > 1 ? 'ies' : 'y'}`);
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
        message: `⚠️ Address "${name}" has been updated successfully!`,
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

      // Enforce free-plan friend limit (e.g. max 2 friends)
      // Fetch current friends count
      const existingFriends = await getUserFriends(this.db, this.userId);

      // Default free plan limit is 2 friends; paid plans can be configured via metadata.maxFriends
      const defaultFreeFriendLimit = 2;

      // Try to load subscription & plan metadata to see if there is a specific maxFriends limit
      let effectiveMaxFriends: number | null = null;
      try {
        const subscription = await getUserSubscription(this.db, this.userId);
        if (subscription?.plan) {
          const plan = await getPlanById(this.db, subscription.plan);
          const metadata = (plan?.metadata as any) || null;
          const limits = getPlanLimits(metadata);
          effectiveMaxFriends =
            typeof limits.maxFriends === 'number' ? limits.maxFriends : null;
        }
      } catch (error) {
        logger.warn(
          { error, userId: this.userId },
          'Failed to resolve subscription/plan for friend limit; falling back to default free limit'
        );
      }

      const maxFriends =
        effectiveMaxFriends !== null ? effectiveMaxFriends : defaultFreeFriendLimit;

      if (existingFriends.length >= maxFriends) {
        return {
          success: false,
          message:
            "You’ve reached the maximum number of friends for your current plan. Please upgrade your subscription in the app to add more friends.",
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
        message: `⚠️ *Friend Updated*\nName: ${updated.name}`,
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
        message: `⚠️ *Friend Folder Updated*\n"${parsed.folderRoute}" → "${parsed.newName}"`,
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
   * Resolve recipient email, phone number, friend name, or tag to user IDs
   * Returns array of user IDs (can be multiple if tag is used)
   * Returns empty array if no users found
   */
  private async resolveRecipients(recipient: string): Promise<string[]> {
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
          return [user.id];
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
          return [user.id];
        }
      } catch (error) {
        logger.error(
          { error, recipient: trimmedRecipient, userId: this.userId },
          'Error looking up user by phone'
        );
      }
    }
    
    // If recipient doesn't look like email or phone, check if it's a tag
    if (!isEmail && !isPhone) {
      try {
        // Get all friends to check for tags
        const friends = await getUserFriends(this.db, this.userId);
        
        // Check if recipient matches any tag in the friend's tags array (case-insensitive)
        const matchingTagFriends = friends.filter(friend => {
          if (!friend.tags || !Array.isArray(friend.tags)) return false;
          return friend.tags.some(tag => 
            tag && typeof tag === 'string' && tag.toLowerCase() === trimmedRecipient.toLowerCase()
          );
        });
        
        if (matchingTagFriends.length > 0) {
          // Found friends with this tag - return their connected user IDs
          const userIds = matchingTagFriends
            .map(friend => friend.connectedUserId)
            .filter((userId): userId is string => userId !== null && userId !== undefined);
          
          if (userIds.length > 0) {
            logger.info(
              { tag: trimmedRecipient, friendCount: matchingTagFriends.length, userIdCount: userIds.length, userId: this.userId },
              'Resolved tag to user IDs'
            );
            return userIds;
          } else {
            logger.warn(
              { tag: trimmedRecipient, friendCount: matchingTagFriends.length, userId: this.userId },
              'Tag found but no connected users'
            );
          }
        }
        
        // If not a tag, try searching by name/partial match
    // This handles cases where user provided a name instead of email/phone
    // This now includes searching by friend name
      const users = await searchUsersForSharing(this.db, trimmedRecipient, this.userId);
      if (users.length > 0) {
          return [users[0].id];
        }
      } catch (error) {
        logger.error(
          { error, recipient: trimmedRecipient, userId: this.userId },
          'Error resolving recipients'
        );
      }
    }
    
    // No users found
    return [];
  }

  /**
   * Resolve recipient email, phone number, or friend name to user ID
   * Returns null if user not found (caller should ask for correct email/phone/name)
   * @deprecated Use resolveRecipients for tag support. This is kept for backward compatibility.
   */
  private async resolveRecipient(recipient: string): Promise<string | null> {
    const userIds = await this.resolveRecipients(recipient);
    return userIds.length > 0 ? userIds[0] : null;
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

