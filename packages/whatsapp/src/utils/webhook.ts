import type { WhatsAppWebhookPayload, WhatsAppParsedMessage } from '../schemas/webhook';

/**
 * Extract verification code from message text
 * Looks for 6-digit numbers in the message
 */
export function extractVerificationCode(messageText: string): string | null {
  // Look for 6-digit numbers in the message
  const codeMatch = messageText.match(/\b\d{6}\b/);
  return codeMatch ? codeMatch[0] : null;
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