import { z } from "zod";

// WhatsApp webhook message types
export const whatsappMessageTextSchema = z.object({
  body: z.string(),
});

export const whatsappMessageAudioSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
});

export const whatsappMessageImageSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  caption: z.string().optional(),
});

export const whatsappMessageDocumentSchema = z.object({
  id: z.string(),
  mime_type: z.string().optional(),
  sha256: z.string().optional(),
  filename: z.string().optional(),
  caption: z.string().optional(),
});

export const whatsappInteractiveListReplySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

export const whatsappInteractiveSchema = z.object({
  type: z.enum(["list_reply", "button_reply", "nfm_reply"]),
  list_reply: whatsappInteractiveListReplySchema.optional(),
  button_reply: z.object({
    id: z.string(),
    title: z.string(),
  }).optional(),
  nfm_reply: z.object({
    response_json: z.record(z.string(), z.unknown()),
  }).optional(),
});

// Base message schema
export const whatsappMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  timestamp: z.string(),
  type: z.enum(["text", "audio", "voice", "image", "document", "video", "location", "contacts", "button", "interactive"]),
  context: z.object({
    from: z.string().optional(),
    id: z.string().optional(),
  }).optional(),
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
  name: z.string(),
});

export const whatsappContactSchema = z.object({
  profile: whatsappContactProfileSchema,
  wa_id: z.string(),
});

// Metadata schema
export const whatsappMetadataSchema = z.object({
  display_phone_number: z.string(),
  phone_number_id: z.string(),
});

// Status update schema (for message delivery status)
export const whatsappStatusSchema = z.object({
  id: z.string(),
  status: z.enum(["sent", "delivered", "read", "failed"]),
  timestamp: z.string(),
  recipient_id: z.string(),
});

// Value schema (contains the actual webhook data)
export const whatsappValueSchema = z.object({
  messaging_product: z.literal("whatsapp"),
  metadata: whatsappMetadataSchema,
  contacts: z.array(whatsappContactSchema).optional(),
  messages: z.array(whatsappMessageSchema).optional(),
  statuses: z.array(whatsappStatusSchema).optional(),
});

// Change schema
export const whatsappChangeSchema = z.object({
  value: whatsappValueSchema,
  field: z.literal("messages"),
});

// Entry schema
export const whatsappEntrySchema = z.object({
  id: z.string(),
  changes: z.array(whatsappChangeSchema),
});

// Main webhook payload schema
export const whatsappWebhookSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(whatsappEntrySchema),
});

// Parsed message data for processing
export const whatsappParsedMessageSchema = z.object({
  phoneNumber: z.string(),
  messageText: z.string(),
  contactName: z.string().optional(),
  messageId: z.string(),
  messageType: z.string(),
  timestamp: z.string(),
});

// Type exports
export type WhatsAppWebhookPayload = z.infer<typeof whatsappWebhookSchema>;
export type WhatsAppMessage = z.infer<typeof whatsappMessageSchema>;
export type WhatsAppContact = z.infer<typeof whatsappContactSchema>;
export type WhatsAppValue = z.infer<typeof whatsappValueSchema>;
export type WhatsAppParsedMessage = z.infer<typeof whatsappParsedMessageSchema>;