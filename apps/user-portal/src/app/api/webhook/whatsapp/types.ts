import type { Database } from '@imaginecalendar/database/client';

export interface WebhookProcessingSummary {
  voiceJobIds: string[];
  textJobIds: string[];
  verificationSuccess: Array<{ phoneNumber: string; userId: string }>;
  verificationFailures: Array<{ phoneNumber: string; reason: string }>;
  flowResponses: string[];
  pendingIntentUpdates: string[];
  processIntentRequeues: string[];
}

export interface InteractiveSelectionContext {
  message: any;
  interactive: any;
  selectedText: string;
  selectionId: string;
  whatsappNumberId: string;
  db: Database;
  summary: WebhookProcessingSummary;
}
