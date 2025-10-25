import { z } from "zod";

// WhatsApp webhook message types
export const whatsappMessageTextSchema = z.object({
  body: z.string(), // Text content of the message
});

export const whatsappMessageAudioSchema = z.object({
  id: z.string(), // Media ID from WhatsApp
  mime_type: z.string().optional(), // MIME type of the audio file
});

export const whatsappMessageImageSchema = z.object({
  id: z.string(), // Media ID from WhatsApp
  mime_type: z.string().optional(), // MIME type of the image
  sha256: z.string().optional(), // SHA256 hash of the image
  caption: z.string().optional(), // Image caption
});

export const whatsappMessageDocumentSchema = z.object({
  id: z.string(), // Media ID from WhatsApp
  mime_type: z.string().optional(), // MIME type of the document
  sha256: z.string().optional(), // SHA256 hash of the document
  filename: z.string().optional(), // Original filename
  caption: z.string().optional(), // Document caption
});

export const whatsappInteractiveListReplySchema = z.object({
  id: z.string(), // The ID of the selected list item
  title: z.string(), // The title of the selected list item
  description: z.string().optional(), // The description of the selected list item (if any)
});

export const whatsappInteractiveSchema = z.object({
  type: z.enum(["list_reply", "button_reply", "nfm_reply"]), // Type of interactive reply
  list_reply: whatsappInteractiveListReplySchema.optional(), // List selection response
  button_reply: z.object({
    id: z.string(),
    title: z.string(),
  }).optional(), // Button selection response
  nfm_reply: z.object({
    response_json: z.record(z.string(), z.unknown()),
  }).optional(),
});

// Base message schema
export const whatsappMessageSchema = z.object({
  id: z.string(), // Unique message ID from WhatsApp
  from: z.string(), // Sender's phone number
  timestamp: z.string(), // Unix timestamp when message was sent
  type: z.enum(["text", "audio", "voice", "image", "document", "video", "location", "contacts", "button", "interactive"]), // Type of WhatsApp message
  context: z.object({
    from: z.string().optional(), // Phone number of the original sender (for replies)
    id: z.string().optional(), // ID of the message being replied to
  }).optional(), // Context information for replies
  // Message content based on type
  text: whatsappMessageTextSchema.optional(),
  audio: whatsappMessageAudioSchema.optional(),
  voice: whatsappMessageAudioSchema.optional(),
  image: whatsappMessageImageSchema.optional(),
  document: whatsappMessageDocumentSchema.optional(),
  interactive: whatsappInteractiveSchema.optional(),
});

// Contact profile schema
export const whatsappContactProfileSchema = z.object({
  name: z.string(), // Contact's display name on WhatsApp
});

export const whatsappContactSchema = z.object({
  profile: whatsappContactProfileSchema,
  wa_id: z.string(), // WhatsApp ID (phone number)
});

// Metadata schema
export const whatsappMetadataSchema = z.object({
  display_phone_number: z.string(), // Display phone number of the WhatsApp Business account
  phone_number_id: z.string(), // Phone number ID from WhatsApp Business API
});

// Status update schema (for message delivery status)
export const whatsappStatusSchema = z.object({
  id: z.string(), // Message ID that this status refers to
  status: z.enum(["sent", "delivered", "read", "failed"]), // Message delivery status
  timestamp: z.string(), // Unix timestamp of status update
  recipient_id: z.string(), // Recipient's phone number
});

// Value schema (contains the actual webhook data)
export const whatsappValueSchema = z.object({
  messaging_product: z.literal("whatsapp"), // Always 'whatsapp' for WhatsApp webhooks
  metadata: whatsappMetadataSchema,
  contacts: z.array(whatsappContactSchema).optional(), // Array of contacts who sent messages
  messages: z.array(whatsappMessageSchema).optional(), // Array of messages received
  statuses: z.array(whatsappStatusSchema).optional(), // Array of message status updates
});

// Change schema
export const whatsappChangeSchema = z.object({
  value: whatsappValueSchema,
  field: z.literal("messages"), // Always 'messages' for message webhooks
});

// Entry schema
export const whatsappEntrySchema = z.object({
  id: z.string(), // WhatsApp Business Account ID
  changes: z.array(whatsappChangeSchema), // Array of changes (usually one)
});

// Main webhook payload schema
export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"), // Always 'whatsapp_business_account' for WhatsApp webhooks
  entry: z.array(whatsappEntrySchema), // Array of webhook entries (usually one)
});

// Parsed message data for processing
export const whatsappParsedMessageSchema = z.object({
  phoneNumber: z.string(), // Sender's phone number
  messageText: z.string(), // Text content of the message
  contactName: z.string().optional(), // Sender's display name
  messageId: z.string(), // WhatsApp message ID
  messageType: z.string(), // Type of message
  timestamp: z.string(), // Unix timestamp when message was sent
});

// Type exports
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>;
export type WhatsAppContact = z.infer<typeof whatsappContactSchema>;
export type WhatsAppValue = z.infer<typeof whatsappValueSchema>;
export type WhatsAppParsedMessage = z.infer<typeof whatsappParsedMessageSchema>;