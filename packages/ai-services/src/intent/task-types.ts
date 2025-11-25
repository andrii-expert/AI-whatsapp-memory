// Task Intent Analysis types and Zod schemas
// Handles tasks, reminders, notes, and calendar events

import { z } from 'zod';

// Intent type enum - what the user wants to do
export const intentTypeEnum = z.enum(['task', 'reminder', 'note', 'calendar', 'unknown']);

// Task action types
export const taskActionEnum = z.enum(['CREATE', 'UPDATE', 'DELETE', 'COMPLETE', 'MOVE', 'SHARE', 'FOLDER_CREATE', 'FOLDER_RENAME', 'FOLDER_DELETE', 'FOLDER_SHARE', 'QUERY']);

// Task intent schema
export const taskIntentSchema = z.object({
  // Intent type
  intentType: intentTypeEnum.describe('The type of intent: task, reminder, note, calendar, or unknown'),
  
  // Task action
  action: taskActionEnum.describe('The intended task action'),
  
  // Task details (for CREATE/UPDATE)
  title: z.string().optional().describe('Task title/content'),
  description: z.string().optional().describe('Task description/notes'),
  folderName: z.string().optional().describe('Folder name for folder operations or task placement'),
  parentFolderName: z.string().optional().describe('Parent folder name for subfolder creation'),
  
  // For UPDATE/DELETE/COMPLETE/MOVE/SHARE: identification of existing task
  targetTaskTitle: z.string().optional().describe('Title of task to update/delete/complete/move/share'),
  targetTaskFolder: z.string().optional().describe('Folder containing the target task'),
  
  // For MOVE: destination
  destinationFolderName: z.string().optional().describe('Destination folder name for moving tasks'),
  
  // For SHARE: who to share with
  shareWithName: z.string().optional().describe('Name of person to share task/folder with'),
  shareWithEmail: z.string().optional().describe('Email of person to share task/folder with'),
  
  // For FOLDER operations
  oldFolderName: z.string().optional().describe('Current folder name for rename operation'),
  newFolderName: z.string().optional().describe('New folder name for rename operation'),
  
  // Due date (for tasks/reminders)
  dueDate: z.string().optional().describe('Due date in YYYY-MM-DD format'),
  dueTime: z.string().optional().describe('Due time in HH:MM format (24-hour)'),
  
  // Metadata
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  
  // What AI detected as missing
  missingFields: z.array(z.enum([
    'title',
    'targetTaskTitle',
    'folderName',
    'destinationFolderName',
    'shareWithName',
    'oldFolderName',
    'newFolderName',
  ])).optional().describe('Fields that AI could not extract from the message'),
});

export type TaskIntent = z.infer<typeof taskIntentSchema>;
export type IntentType = z.infer<typeof intentTypeEnum>;
export type TaskAction = z.infer<typeof taskActionEnum>;

