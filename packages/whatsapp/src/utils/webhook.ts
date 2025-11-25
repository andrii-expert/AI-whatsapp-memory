import type { WhatsAppWebhookPayload, WhatsAppParsedMessage } from '../schemas/webhook';

/**
 * Extract verification code from message text
 * Looks for 6-digit numbers in the message
 * Also handles full verification message format:
 * "Hello! I'd like to connect my WhatsApp to CrackOn for voice‑based calendar management. My verification code is: 169753"
 */
export function extractVerificationCode(messageText: string): string | null {
  // First, try to match the full verification message format
  const fullFormatMatch = messageText.match(/verification\s+code\s+is\s*:\s*(\d{6})/i);
  if (fullFormatMatch) {
    return fullFormatMatch[1];
  }
  
  // Also look for 6-digit numbers in the message (fallback)
  const codeMatch = messageText.match(/\b\d{6}\b/);
  return codeMatch ? codeMatch[0] : null;
}

/**
 * Check if message is a verification message
 * Detects the full verification message format
 */
export function isVerificationMessage(messageText: string): boolean {
  const normalized = messageText.toLowerCase();
  // Check for verification message keywords
  const hasVerificationKeywords = 
    normalized.includes('verification code') ||
    normalized.includes('connect my whatsapp') ||
    normalized.includes('crackon');
  
  // Check for 6-digit code
  const hasCode = /\b\d{6}\b/.test(messageText);
  
  return hasVerificationKeywords && hasCode;
}

/**
 * Parse webhook payload for verification messages
 * Extracts text messages that could contain verification codes
 */
export function parseWebhookForVerification(
  payload: WhatsAppWebhookPayload
): WhatsAppParsedMessage[] {
  const parsedMessages: WhatsAppParsedMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const { value } = change;

      // Only process if we have messages and contacts
      if (!value.messages || !value.contacts) continue;

      for (const message of value.messages) {
        // Only process text messages for verification codes
        if (message.type !== "text" || !message.text?.body) continue;

        // Find corresponding contact
        const contact = value.contacts.find((c) => c.wa_id === message.from);
        if (!contact) continue;

        parsedMessages.push({
          phoneNumber: message.from,
          messageText: message.text.body,
          contactName: contact.profile.name,
          messageId: message.id,
          messageType: message.type,
          timestamp: message.timestamp,
        });
      }
    }
  }

  return parsedMessages;
}