import type { WhatsAppWebhookPayload, WhatsAppParsedMessage } from '../schemas/webhook';

const VERIFICATION_PHRASE_BASE =
  "Hello! I'd like to connect my WhatsApp to CrackOn for voice-based calendar management. My verification code is:";

function normalizeVerificationText(text: string): string {
  return text
    .replace(/[\u2010-\u2015]/g, '-') // normalize dash variants
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const NORMALIZED_VERIFICATION_PHRASE = normalizeVerificationText(VERIFICATION_PHRASE_BASE);

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
 * Check whether a message is the official CrackOn verification phrase.
 */
export function matchesVerificationPhrase(messageText: string): boolean {
  if (!messageText) {
    return false;
  }

  const normalized = normalizeVerificationText(messageText);
  return normalized.startsWith(NORMALIZED_VERIFICATION_PHRASE);
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

        if (!matchesVerificationPhrase(message.text.body)) continue;

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