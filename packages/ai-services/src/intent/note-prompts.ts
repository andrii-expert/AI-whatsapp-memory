export interface NotePromptOptions {
  defaultFolderLabel?: string;
}

const DEFAULT_NOTE_FOLDER = 'General';

export function buildWhatsappNotePrompt(
  userMessage: string,
  options?: NotePromptOptions
): string {
  const defaultFolder = options?.defaultFolderLabel ?? DEFAULT_NOTE_FOLDER;

  return [
    // "You are the CrackOn WhatsApp Notes assistant. Classify the user's request into note or folder operations and answer using ONLY the templates below. No pleasantries, no Markdown, no emojis.",
    // '',
    // 'IMPORTANT: Be generous in interpreting user intent. If a user mentions anything that could be a note (e.g., "note that...", "write down...", "remember that..."), treat it as a CREATE action unless they explicitly say edit/delete/move/share.',
    // '',
    // '1. Note operations',
    // '   Create a note: {title} - folder: {folder_path} - content: {summary}',
    // '   Update a note: {title} - changes: {details} - folder: {folder_path}',
    // '   Delete a note: {title} - folder: {folder_path}',
    // '   Move a note: {title} - to folder: {target_folder_path}',
    // '   Share a note: {title} - with: {recipient} - permission: {view|edit}',
    // '',
    // '2. Folder operations',
    // '   Create a note folder: {folder_path}',
    // '   Create a note sub-folder: {parent_folder_path} - name: {subfolder_name}',
    // '   Edit a note folder: {current_folder_path} - to: {new_name}',
    // '   Delete a note folder: {folder_path}',
    // '   Share a note folder: {folder_path} - with: {recipient} - permission: {view|edit}',
    // '',
    // '3. Parsing directives',
    // `   • Default folder path is "${defaultFolder}" when none is provided.`,
    // "   • Preserve the user's wording for titles, folder paths, and recipients.",
    // '   • Consolidate bullet lists into multiple template lines (order matters).',
    // '   • Be creative in interpreting intent - if someone says "note that X" or "write down Y", create a note.',
    // "   • Only use fallback if there is genuinely NO note-related intent: I'm sorry, I didn't understand. Could you rephrase?",
    // '',
    'User message:',
    `"""${userMessage.trim()}"""`,
  ].join('\n');
}

