import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  uuid,
  index,
  uniqueIndex,
  pgEnum,
  jsonb,
  real,
  date
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================
// Enums
// ============================================

export const planStatusEnum = pgEnum("plan_status", [
  "draft",
  "active",
  "archived"
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "cancelled",
  "expired",
  "past_due",
  "paused"
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed"
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "card",
  "eft",
  "instant_eft",
  "debit_order"
]);

export const calendarProviderEnum = pgEnum("calendar_provider", [
  "google",
  "microsoft"
]);

export const currencyEnum = pgEnum("currency", [
  "ZAR",
  "USD",
  "EUR",
  "GBP"
]);

export const dateFormatEnum = pgEnum("date_format", [
  "DD/MM/YYYY",
  "MM/DD/YYYY",
  "YYYY-MM-DD"
]);

export const timeFormatEnum = pgEnum("time_format", [
  "12h",
  "24h"
]);

export const activityActionEnum = pgEnum("activity_action", [
  "user.created",
  "user.updated",
  "user.deleted",
  "subscription.created",
  "subscription.upgraded",
  "subscription.downgraded",
  "subscription.cancelled",
  "subscription.renewed",
  "payment.completed",
  "payment.failed",
  "payment.refunded",
  "calendar.connected",
  "calendar.disconnected",
  "whatsapp.verified",
  "whatsapp.disconnected"
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "user",
  "subscription",
  "payment",
  "calendar_connection",
  "whatsapp_number"
]);

// ============================================
// Plans
// ============================================

export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  billingPeriod: text("billing_period").notNull(),
  displayPrice: text("display_price").notNull(),
  amountCents: integer("amount_cents").notNull(),
  monthlyPriceCents: integer("monthly_price_cents").notNull(),
  trialDays: integer("trial_days").default(0).notNull(),
  status: planStatusEnum("status").default("draft").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  metadata: jsonb("metadata"),
  payfastConfig: jsonb("payfast_config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("plans_status_idx").on(table.status),
  sortOrderIdx: index("plans_sort_order_idx").on(table.sortOrder),
}));

export const planFeatures = pgTable("plan_features", {
  id: uuid("id").defaultRandom().primaryKey(),
  planId: text("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  planIdIdx: index("plan_features_plan_id_idx").on(table.planId),
  planPositionIdx: uniqueIndex("plan_features_plan_position_unique").on(table.planId, table.position),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  features: many(planFeatures),
}));

export const planFeaturesRelations = relations(planFeatures, ({ one }) => ({
  plan: one(plans, {
    fields: [planFeatures.planId],
    references: [plans.id],
  }),
}));

export type PlanId = typeof plans.$inferSelect["id"];

// ============================================
// Users & Authentication
// ============================================

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user ID
  email: text("email").notNull().unique(),

  // Name fields (split from single "name" field)
  firstName: text("first_name"),
  lastName: text("last_name"),
  name: text("name"), // DEPRECATED - kept for backward compatibility, will be removed in future

  // Onboarding fields
  country: text("country"),
  ageGroup: text("age_group"), // "18-25", "26-35", "36-45", "46 and over"
  gender: text("gender"), // "male", "female", "other", "prefer_not_to_say"
  birthday: date("birthday"),
  mainUse: text("main_use"), // Primary use case
  howHeardAboutUs: text("how_heard_about_us"), // Marketing attribution

  // Contact & verification
  phone: text("phone"),
  phoneVerified: boolean("phone_verified").default(false).notNull(),
  company: text("company"),
  avatarUrl: text("avatar_url"),

  // Admin & metadata
  isAdmin: boolean("is_admin").default(false).notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  phoneIdx: index("users_phone_idx").on(table.phone),
  isAdminIdx: index("users_is_admin_idx").on(table.isAdmin),
  deletedAtIdx: index("users_deleted_at_idx").on(table.deletedAt),
  countryIdx: index("users_country_idx").on(table.country),
  ageGroupIdx: index("users_age_group_idx").on(table.ageGroup),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences),
  subscription: one(subscriptions),
  payments: many(payments),
  calendarConnections: many(calendarConnections),
  whatsappNumbers: many(whatsappNumbers),
  whatsappMessageLogs: many(whatsappMessageLogs),
  voiceMessageJobs: many(voiceMessageJobs),
  activityLogs: many(activityLogs),
}));

// ============================================
// User Preferences
// ============================================

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Notification settings
  marketingEmails: boolean("marketing_emails").default(true).notNull(),
  productUpdates: boolean("product_updates").default(true).notNull(),
  reminderNotifications: boolean("reminder_notifications").default(true).notNull(),
  
  // WhatsApp settings
  reminderMinutes: integer("reminder_minutes").default(10).notNull(),
  defaultCalendarId: text("default_calendar_id"),
  
  // Locale settings
  timezone: text("timezone").default("Africa/Johannesburg").notNull(),
  dateFormat: dateFormatEnum("date_format").default("DD/MM/YYYY").notNull(),
  timeFormat: timeFormatEnum("time_format").default("24h").notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex("user_preferences_user_id_idx").on(table.userId),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

// ============================================
// Subscriptions
// ============================================

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  plan: text("plan").notNull().references(() => plans.id, { onDelete: "restrict", onUpdate: "cascade" }),
  status: subscriptionStatusEnum("status").notNull(),
  
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
  
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  
  // PayFast subscription ID
  payfastSubscriptionId: text("payfast_subscription_id"),
  payfastToken: text("payfast_token"),
  
  metadata: text("metadata"), // JSON string for additional data

  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex("subscriptions_user_id_idx").on(table.userId),
  statusIdx: index("subscriptions_status_idx").on(table.status),
  payfastSubscriptionIdx: index("subscriptions_payfast_subscription_idx").on(table.payfastSubscriptionId),
  deletedAtIdx: index("subscriptions_deleted_at_idx").on(table.deletedAt),
  planIdx: index("subscriptions_plan_idx").on(table.plan),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  payments: many(payments),
}));

// ============================================
// Payments & Invoices
// ============================================

export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
  
  // Amount fields (stored in cents for precision)
  amount: integer("amount").notNull(), // Base amount in cents
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).default("15.00").notNull(),
  vatAmount: integer("vat_amount").notNull(), // VAT amount in cents
  totalAmount: integer("total_amount").notNull(), // Total amount in cents
  currency: currencyEnum("currency").default("ZAR").notNull(),
  
  // Invoice details
  invoiceNumber: text("invoice_number").unique().notNull(), // INV-2024-0001
  description: text("description").notNull(),
  billingPeriodStart: timestamp("billing_period_start", { withTimezone: true }),
  billingPeriodEnd: timestamp("billing_period_end", { withTimezone: true }),
  
  // Payment details
  paymentMethod: paymentMethodEnum("payment_method"),
  status: paymentStatusEnum("status").notNull(),
  
  // PayFast details
  payfastPaymentId: text("payfast_payment_id"),
  payfastPaymentUuid: text("payfast_payment_uuid"),
  payfastMPaymentId: text("payfast_m_payment_id").unique(), // m_payment_id from PayFast ITN
  
  // Refund details
  refundAmount: integer("refund_amount"), // Amount refunded in cents
  refundReason: text("refund_reason"),
  
  // Timestamps
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  
  metadata: text("metadata"), // JSON string for additional data

  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("payments_user_id_idx").on(table.userId),
  subscriptionIdIdx: index("payments_subscription_id_idx").on(table.subscriptionId),
  statusIdx: index("payments_status_idx").on(table.status),
  invoiceNumberIdx: uniqueIndex("payments_invoice_number_idx").on(table.invoiceNumber),
  createdAtIdx: index("payments_created_at_idx").on(table.createdAt),
  payfastPaymentIdx: index("payments_payfast_payment_idx").on(table.payfastPaymentId),
  payfastMPaymentIdx: uniqueIndex("payments_payfast_m_payment_idx").on(table.payfastMPaymentId),
  deletedAtIdx: index("payments_deleted_at_idx").on(table.deletedAt),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  user: one(users, {
    fields: [payments.userId],
    references: [users.id],
  }),
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ============================================
// Calendar Connections
// ============================================

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  provider: calendarProviderEnum("provider").notNull(),
  email: text("email").notNull(),
  calendarId: text("calendar_id"), // Provider's calendar ID
  calendarName: text("calendar_name"), // Display name
  
  // OAuth tokens (encrypted in production)
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  
  // Connection status
  isActive: boolean("is_active").default(true).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSyncError: text("last_sync_error"),
  syncFailureCount: integer("sync_failure_count").default(0).notNull(),
  
  // Provider-specific data
  providerAccountId: text("provider_account_id"),
  providerData: text("provider_data"), // JSON string
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("calendar_connections_user_id_idx").on(table.userId),
  providerIdx: index("calendar_connections_provider_idx").on(table.provider),
  userProviderIdx: index("calendar_connections_user_provider_idx").on(table.userId, table.provider, table.email),
  isActiveIdx: index("calendar_connections_is_active_idx").on(table.isActive),
}));

export const calendarConnectionsRelations = relations(calendarConnections, ({ one }) => ({
  user: one(users, {
    fields: [calendarConnections.userId],
    references: [users.id],
  }),
}));

// ============================================
// WhatsApp Numbers
// ============================================

export const whatsappNumbers = pgTable("whatsapp_numbers", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  
  phoneNumber: text("phone_number").notNull().unique(),
  displayName: text("display_name"),
  
  isVerified: boolean("is_verified").default(false).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  
  verificationCode: text("verification_code"),
  verificationExpiresAt: timestamp("verification_expires_at", { withTimezone: true }),
  verificationAttempts: integer("verification_attempts").default(0).notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  
  // WhatsApp specific
  whatsappId: text("whatsapp_id"), // WhatsApp's ID for this number
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  messageCount: integer("message_count").default(0).notNull(), // Total messages (in + out)

  // Cost tracking fields
  outgoingMessageCount: integer("outgoing_message_count").default(0).notNull(),
  lastOutgoingMessageAt: timestamp("last_outgoing_message_at", { withTimezone: true }),
  totalCostCents: integer("total_cost_cents").default(0).notNull(), // Total cost in cents
  currentMonthCostCents: integer("current_month_cost_cents").default(0).notNull(), // Current month cost in cents
  costTrackingStartAt: timestamp("cost_tracking_start_at", { withTimezone: true }).defaultNow().notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("whatsapp_numbers_user_id_idx").on(table.userId),
  phoneNumberIdx: uniqueIndex("whatsapp_numbers_phone_idx").on(table.phoneNumber),
  isActiveIdx: index("whatsapp_numbers_is_active_idx").on(table.isActive),
}));

export const whatsappNumbersRelations = relations(whatsappNumbers, ({ one, many }) => ({
  user: one(users, {
    fields: [whatsappNumbers.userId],
    references: [users.id],
  }),
  messageLogs: many(whatsappMessageLogs),
  voiceMessageJobs: many(voiceMessageJobs),
}));

// ============================================
// WhatsApp Message Logs (for detailed cost tracking)
// ============================================

export const whatsappMessageLogs = pgTable("whatsapp_message_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),

  // Message details
  messageId: text("message_id"), // WhatsApp message ID if available
  direction: text("direction").notNull(), // 'outgoing' | 'incoming'
  messageType: text("message_type").default("text").notNull(), // 'text' | 'voice' | 'image' | 'document'

  // Cost information (only for outgoing messages)
  costCents: integer("cost_cents").default(0).notNull(), // Cost in cents
  exchangeRateUsdToZar: decimal("exchange_rate_usd_to_zar", { precision: 10, scale: 4 }), // USD to ZAR rate used

  // Metadata
  processed: boolean("processed").default(false).notNull(), // Whether cost has been processed
  errorMessage: text("error_message"), // Any processing errors

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  whatsappNumberIdIdx: index("whatsapp_message_logs_number_id_idx").on(table.whatsappNumberId),
  userIdIdx: index("whatsapp_message_logs_user_id_idx").on(table.userId),
  directionIdx: index("whatsapp_message_logs_direction_idx").on(table.direction),
  createdAtIdx: index("whatsapp_message_logs_created_at_idx").on(table.createdAt),
  processedIdx: index("whatsapp_message_logs_processed_idx").on(table.processed),
}));

export const whatsappMessageLogsRelations = relations(whatsappMessageLogs, ({ one }) => ({
  whatsappNumber: one(whatsappNumbers, {
    fields: [whatsappMessageLogs.whatsappNumberId],
    references: [whatsappNumbers.id],
  }),
  user: one(users, {
    fields: [whatsappMessageLogs.userId],
    references: [users.id],
  }),
}));

// ============================================
// Activity Log (for audit trail)
// ============================================

export const activityLogs = pgTable("activity_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  
  action: activityActionEnum("action").notNull(),
  entityType: entityTypeEnum("entity_type"),
  entityId: text("entity_id"), // ID of the affected entity
  
  metadata: text("metadata"), // JSON string with action details
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("activity_logs_user_id_idx").on(table.userId),
  actionIdx: index("activity_logs_action_idx").on(table.action),
  entityIdx: index("activity_logs_entity_idx").on(table.entityType, table.entityId),
  createdAtIdx: index("activity_logs_created_at_idx").on(table.createdAt),
}));

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  user: one(users, {
    fields: [activityLogs.userId],
    references: [users.id],
  }),
}));

// ============================================
// Voice Message Processing
// ============================================

export const voiceMessageJobs = pgTable("voice_message_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),

  // User & WhatsApp info
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),

  // WhatsApp message data
  messageId: text("message_id").notNull().unique(),
  mediaId: text("media_id").notNull(),
  senderPhone: text("sender_phone").notNull(),
  mimeType: text("mime_type"),

  // Processing status
  status: text("status").notNull().default("pending"),
  // Status: pending, downloading, transcribing, analyzing, creating_event, completed, failed

  // Provider tracking
  sttProvider: text("stt_provider"), // 'openai-whisper', 'elevenlabs', etc.
  sttProviderFallback: text("stt_provider_fallback"), // If fallback was used
  intentProvider: text("intent_provider"), // 'openai-gpt4o-mini'

  // Audio file info
  audioFilePath: text("audio_file_path"),
  audioDurationSeconds: real("audio_duration_seconds"),
  audioFileSizeBytes: integer("audio_file_size_bytes"),

  // Transcription results
  transcribedText: text("transcribed_text"),
  transcriptionLanguage: text("transcription_language"),
  transcriptionSegments: jsonb("transcription_segments"), // Word/segment timestamps
  transcriptionCost: decimal("transcription_cost", { precision: 10, scale: 6 }),

  // Intent analysis results
  intentAnalysis: jsonb("intent_analysis"), // Full CalendarIntent object
  calendarEventId: text("calendar_event_id"),
  calendarProvider: text("calendar_provider"), // 'google' or 'microsoft'
  intentJobId: uuid("intent_job_id"),
  intentSnapshot: jsonb("intent_snapshot"),
  clarificationStatus: text("clarification_status"),

  // Error tracking
  errorMessage: text("error_message"),
  errorStage: text("error_stage"),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(3).notNull(),

  // Testing fields
  isTestJob: boolean("is_test_job").default(false).notNull(),
  testConfiguration: jsonb("test_configuration"),
  pausedAtStage: text("paused_at_stage"),
  testNotes: text("test_notes"),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("voice_jobs_status_idx").on(table.status),
  userIdIdx: index("voice_jobs_user_id_idx").on(table.userId),
  createdAtIdx: index("voice_jobs_created_at_idx").on(table.createdAt),
  whatsappNumberIdIdx: index("voice_jobs_whatsapp_number_id_idx").on(table.whatsappNumberId),
  messageIdIdx: uniqueIndex("voice_jobs_message_id_idx").on(table.messageId),
  isTestJobIdx: index("voice_jobs_is_test_job_idx").on(table.isTestJob),
}));

export const voiceJobTimings = pgTable("voice_job_timings", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => voiceMessageJobs.id, { onDelete: "cascade" }),
  stage: text("stage").notNull(),
  stageGroup: text("stage_group"),
  sequence: integer("sequence").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jobIdIdx: index("voice_job_timings_job_id_idx").on(table.jobId),
  stageIdx: index("voice_job_timings_stage_idx").on(table.stage),
  sequenceIdx: index("voice_job_timings_job_sequence_idx").on(table.jobId, table.sequence),
}));

export const intentPipelinePayloads = pgTable("intent_pipeline_payloads", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => voiceMessageJobs.id, { onDelete: "cascade" }),
  sequence: integer("sequence").default(0).notNull(),
  payloadType: text("payload_type").notNull(),
  provider: text("provider"),
  metadata: jsonb("metadata"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jobIdIdx: index("intent_payloads_job_id_idx").on(table.jobId),
  sequenceIdx: index("intent_payloads_job_sequence_idx").on(table.jobId, table.sequence),
  typeIdx: index("intent_payloads_type_idx").on(table.payloadType),
}));

export const voiceJobTimingsRelations = relations(voiceJobTimings, ({ one }) => ({
  job: one(voiceMessageJobs, {
    fields: [voiceJobTimings.jobId],
    references: [voiceMessageJobs.id],
  }),
}));

export const intentPipelinePayloadsRelations = relations(intentPipelinePayloads, ({ one }) => ({
  job: one(voiceMessageJobs, {
    fields: [intentPipelinePayloads.jobId],
    references: [voiceMessageJobs.id],
  }),
}));

export const voiceMessageJobsRelations = relations(voiceMessageJobs, ({ one, many }) => ({
  user: one(users, {
    fields: [voiceMessageJobs.userId],
    references: [users.id],
  }),
  whatsappNumber: one(whatsappNumbers, {
    fields: [voiceMessageJobs.whatsappNumberId],
    references: [whatsappNumbers.id],
  }),
  timings: many(voiceJobTimings),
  intentPayloads: many(intentPipelinePayloads),
}));

export const pendingIntents = pgTable("pending_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  jobId: uuid("job_id").notNull().references(() => voiceMessageJobs.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),
  intentSnapshot: jsonb("intent_snapshot").notNull(),
  clarificationPlan: jsonb("clarification_plan").notNull(),
  status: text("status").default("awaiting_clarification").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  jobIdIdx: uniqueIndex("pending_intents_job_id_idx").on(table.jobId),
  userIdIdx: index("pending_intents_user_id_idx").on(table.userId),
  whatsappNumberIdIdx: index("pending_intents_whatsapp_number_id_idx").on(table.whatsappNumberId),
  statusIdx: index("pending_intents_status_idx").on(table.status),
  expiresAtIdx: index("pending_intents_expires_at_idx").on(table.expiresAt),
}));

export const flowSessions = pgTable("flow_sessions", {
  flowToken: text("flow_token").primaryKey(),
  pendingIntentId: uuid("pending_intent_id").notNull().references(() => pendingIntents.id, { onDelete: "cascade" }),
  fieldsRequested: jsonb("fields_requested").notNull(),
  responseData: jsonb("response_data"),
  responseReceived: boolean("response_received").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pendingIntentIdx: index("flow_sessions_pending_intent_id_idx").on(table.pendingIntentId),
  expiresAtIdx: index("flow_sessions_expires_at_idx").on(table.expiresAt),
}));

export const interactivePrompts = pgTable("interactive_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  pendingIntentId: uuid("pending_intent_id").notNull().references(() => pendingIntents.id, { onDelete: "cascade" }),
  whatsappMessageId: text("whatsapp_message_id"),
  fieldKey: text("field_key").notNull(),
  options: jsonb("options").notNull(),
  selectedValue: text("selected_value"),
  responseReceived: boolean("response_received").default(false).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pendingIntentIdx: index("interactive_prompts_pending_intent_id_idx").on(table.pendingIntentId),
  fieldKeyIdx: index("interactive_prompts_field_key_idx").on(table.fieldKey),
  expiresAtIdx: index("interactive_prompts_expires_at_idx").on(table.expiresAt),
}));

export const pendingIntentsRelations = relations(pendingIntents, ({ one, many }) => ({
  voiceJob: one(voiceMessageJobs, {
    fields: [pendingIntents.jobId],
    references: [voiceMessageJobs.id],
  }),
  user: one(users, {
    fields: [pendingIntents.userId],
    references: [users.id],
  }),
  whatsappNumber: one(whatsappNumbers, {
    fields: [pendingIntents.whatsappNumberId],
    references: [whatsappNumbers.id],
  }),
  flowSessions: many(flowSessions),
  interactivePrompts: many(interactivePrompts),
}));

export const flowSessionsRelations = relations(flowSessions, ({ one }) => ({
  pendingIntent: one(pendingIntents, {
    fields: [flowSessions.pendingIntentId],
    references: [pendingIntents.id],
  }),
}));

export const interactivePromptsRelations = relations(interactivePrompts, ({ one }) => ({
  pendingIntent: one(pendingIntents, {
    fields: [interactivePrompts.pendingIntentId],
    references: [pendingIntents.id],
  }),
}));

// STT Provider Statistics
export const sttProviderStats = pgTable("stt_provider_stats", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerName: text("provider_name").notNull(),

  // Usage metrics
  totalRequests: integer("total_requests").default(0).notNull(),
  successfulRequests: integer("successful_requests").default(0).notNull(),
  failedRequests: integer("failed_requests").default(0).notNull(),
  fallbackCount: integer("fallback_count").default(0).notNull(),

  // Performance metrics
  avgDurationMs: real("avg_duration_ms"),
  totalAudioMinutes: real("total_audio_minutes").default(0).notNull(),
  totalCost: decimal("total_cost", { precision: 12, scale: 4 }).default("0").notNull(),

  // Time period
  date: date("date").notNull(),
  hour: integer("hour"), // NULL for daily stats, 0-23 for hourly

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  providerDateIdx: index("stt_stats_provider_date_idx").on(table.providerName, table.date),
}));

// Intent Feedback for Continuous Improvement
export const intentFeedback = pgTable("intent_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  voiceJobId: uuid("voice_job_id").references(() => voiceMessageJobs.id, { onDelete: "cascade" }),

  transcribedText: text("transcribed_text").notNull(),
  originalIntent: jsonb("original_intent").notNull(),

  // User feedback
  wasCorrect: boolean("was_correct"),
  userFeedback: text("user_feedback"),
  correctedIntent: jsonb("corrected_intent"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  feedbackAt: timestamp("feedback_at", { withTimezone: true }),
}, (table) => ({
  voiceJobIdIdx: index("intent_feedback_voice_job_id_idx").on(table.voiceJobId),
  wasCorrectIdx: index("intent_feedback_was_correct_idx").on(table.wasCorrect),
}));

export const intentFeedbackRelations = relations(intentFeedback, ({ one }) => ({
  voiceJob: one(voiceMessageJobs, {
    fields: [intentFeedback.voiceJobId],
    references: [voiceMessageJobs.id],
  }),
}));

// Conversation State for Multi-Turn Interactions
export const conversationStates = pgTable("conversation_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),
  voiceJobId: uuid("voice_job_id").references(() => voiceMessageJobs.id, { onDelete: "cascade" }),

  // State
  status: text("status").notNull().default("waiting_for_input"),
  // Status: waiting_for_input, processing, completed, expired

  // Partial data from initial intent analysis
  partialIntent: jsonb("partial_intent").notNull(), // CalendarIntent object
  pendingResolutions: jsonb("pending_resolutions").notNull(), // What needs to be resolved

  // Conversation context
  lastQuestionAsked: text("last_question_asked"),
  lastMessageId: text("last_message_id"), // WhatsApp message ID we sent
  expectedResponseType: text("expected_response_type"), // 'time', 'contact_selection', 'date_clarification', etc.

  // Resolved data (accumulated from user responses)
  resolvedData: jsonb("resolved_data"), // Resolved contacts, times, etc.

  // Testing field
  isTestConversation: boolean("is_test_conversation").default(false).notNull(),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // 24 hours from creation
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("conversation_states_user_id_idx").on(table.userId),
  whatsappNumberIdIdx: index("conversation_states_whatsapp_number_id_idx").on(table.whatsappNumberId),
  statusIdx: index("conversation_states_status_idx").on(table.status),
  expiresAtIdx: index("conversation_states_expires_at_idx").on(table.expiresAt),
}));

export const conversationStatesRelations = relations(conversationStates, ({ one }) => ({
  user: one(users, {
    fields: [conversationStates.userId],
    references: [users.id],
  }),
  whatsappNumber: one(whatsappNumbers, {
    fields: [conversationStates.whatsappNumberId],
    references: [whatsappNumbers.id],
  }),
  voiceJob: one(voiceMessageJobs, {
    fields: [conversationStates.voiceJobId],
    references: [voiceMessageJobs.id],
  }),
}));

// ============================================
// Event Verification States
// ============================================

export const eventVerificationStates = pgTable("event_verification_states", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  whatsappNumberId: uuid("whatsapp_number_id").notNull().references(() => whatsappNumbers.id, { onDelete: "cascade" }),
  voiceJobId: uuid("voice_job_id").notNull().references(() => voiceMessageJobs.id, { onDelete: "cascade" }),

  // Verification status
  status: text("status").notNull().default("pending"),
  // Status: pending, approved, rejected, expired

  // Operation being verified
  operationType: text("operation_type").notNull(),
  // Type: create, update, delete

  // Intent/data to verify
  intentToVerify: jsonb("intent_to_verify").notNull(),
  targetEventId: text("target_event_id"), // For update/delete operations

  // User response
  verificationMessageId: text("verification_message_id"), // WhatsApp message ID we sent
  userResponse: text("user_response"), // 'yes' or 'no'
  responseReceivedAt: timestamp("response_received_at", { withTimezone: true }),

  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // 5 minutes from creation
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("event_verification_states_user_id_idx").on(table.userId),
  whatsappNumberIdIdx: index("event_verification_states_whatsapp_number_id_idx").on(table.whatsappNumberId),
  voiceJobIdIdx: index("event_verification_states_voice_job_id_idx").on(table.voiceJobId),
  statusIdx: index("event_verification_states_status_idx").on(table.status),
  operationTypeIdx: index("event_verification_states_operation_type_idx").on(table.operationType),
  expiresAtIdx: index("event_verification_states_expires_at_idx").on(table.expiresAt),
}));

export const eventVerificationStatesRelations = relations(eventVerificationStates, ({ one }) => ({
  user: one(users, {
    fields: [eventVerificationStates.userId],
    references: [users.id],
  }),
  whatsappNumber: one(whatsappNumbers, {
    fields: [eventVerificationStates.whatsappNumberId],
    references: [whatsappNumbers.id],
  }),
  voiceJob: one(voiceMessageJobs, {
    fields: [eventVerificationStates.voiceJobId],
    references: [voiceMessageJobs.id],
  }),
}));