// Task Intent Analysis Prompts
// Handles natural language understanding for task operations

import { formatDateToLocalLabel } from '../utils/timezone';

export interface TaskIntentPromptContext {
  timezone?: string;
  currentTime?: Date;
  userFolders?: Array<{
    name: string;
    id: string;
    parentId?: string | null;
  }>;
  recentTasks?: Array<{
    title: string;
    folderName?: string | null;
    status: string;
  }>;
}

export function taskIntentPrompt(
  text: string,
  context?: TaskIntentPromptContext
): string {
  const timezone = context?.timezone ?? 'Africa/Johannesburg';
  const currentDate = context?.currentTime ?? new Date();
  const currentLabel = formatDateToLocalLabel(currentDate, timezone);

  const foldersSection = (context?.userFolders ?? []).length > 0
    ? `\n### User's Folders\n${context.userFolders.map((f, i) => `${i + 1}. ${f.name}${f.parentId ? ' (subfolder)' : ''}`).join('\n')}`
    : '';

  const recentTasksSection = (context?.recentTasks ?? []).length > 0
    ? `\n### Recent Tasks\n${context.recentTasks.slice(0, 10).map((t, i) => `${i + 1}. "${t.title}"${t.folderName ? ` in ${t.folderName}` : ''} (${t.status})`).join('\n')}`
    : '';

  return `You are CrackOn's WhatsApp assistant. Analyze the user's message and determine their intent for managing tasks, reminders, notes, or calendar events.

### Current Context
- Current local date/time: ${currentLabel}
${foldersSection}
${recentTasksSection}

### User Message
"""${text}"""

### Instructions
1. **Determine Intent Type**: First, identify if the user wants to:
   - Create/manage a TASK (to-do item, checklist item, action item)
   - Create/manage a REMINDER (time-based alert)
   - Create/manage a NOTE (information to save)
   - Create/manage a CALENDAR EVENT (meeting, appointment)
   - Or if it's UNKNOWN (general message, greeting, etc.)

2. **For TASK Intent**: Identify the action:
   - CREATE: Creating a new task (e.g., "Buy milk", "Create a task: Contact John", "Add task: Pick up chlorine")
   - UPDATE/EDIT: Modifying an existing task (e.g., "Edit my Task 'Buy milk' to say 'Buy milk and bread'")
   - DELETE: Removing a task (e.g., "Delete the Task Buy milk", "Remove this task")
   - COMPLETE: Marking a task as done (e.g., "Mark the Task Buy milk as complete", "Complete this Task", "Task done")
   - MOVE: Moving a task to a different folder (e.g., "Move the Task Buy milk to the Shopping folder")
   - SHARE: Sharing a task or folder (e.g., "Share the Task Buy milk with Sarah")
   - FOLDER_CREATE: Creating a new folder (e.g., "Create a new folder in Tasks called Work")
   - FOLDER_RENAME: Renaming a folder (e.g., "Rename the Work folder to Office")
   - FOLDER_DELETE: Deleting a folder
   - FOLDER_SHARE: Sharing a folder (e.g., "Share the Work folder with John")
   - QUERY: Asking about tasks (e.g., "What tasks do I have?")

3. **Extract Task Details**:
   - For CREATE: Extract the task title/content from phrases like:
     * "Create a Task: [title]"
     * "Make a Task for me: [title]"
     * "Add a Task saying [title]"
     * "Task: [title]"
     * "New Task: [title]"
     * Just "[title]" if context suggests task creation
   - For UPDATE: Extract both the target task title and the new content
   - For DELETE/COMPLETE/MOVE/SHARE: Extract the target task title
   - For folder operations: Extract folder names (old/new, parent/child)

4. **Handle Variations**: The user may phrase requests in many ways:
   - Direct: "Create a Task: Buy milk"
   - Conversational: "Can you save a Task that says Buy milk?"
   - Voice-style: "Okay, Task: call John tomorrow."
   - Short: "Task: Buy milk"
   - Casual: "Add Task: Pick up chlorine"
   - With folder: "Create a Task in Work folder: Contact John"

5. **Folder Operations**:
   - For folder creation: Extract folder name and optional parent folder
   - For folder rename: Extract old name and new name
   - For moving tasks: Extract task title and destination folder
   - For sharing: Extract resource name (task or folder) and person to share with

6. **Confidence Scoring**: 
   - High (0.8-1.0): Clear intent with all required fields
   - Medium (0.5-0.7): Intent is clear but some details missing
   - Low (0.0-0.4): Ambiguous or unclear intent

7. **Missing Fields**: If required information is missing, list it in missingFields array

8. **Important Notes**:
   - If the message is just a greeting, question, or unrelated text, set intentType to "unknown"
   - If the message contains a verification code format, set intentType to "unknown" (verification is handled separately)
   - For task creation, the title is REQUIRED
   - For task updates/deletes, targetTaskTitle is REQUIRED
   - For folder operations, folder names are REQUIRED

Return only the JSON object that matches the taskIntentSchema.`;

