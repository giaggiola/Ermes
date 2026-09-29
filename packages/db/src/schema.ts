import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const ermesInstallation = pgTable("ermes_installation", {
  id: integer("id").primaryKey(),
  merchant: jsonb("merchant"),
  credentials: jsonb("credentials").notNull().default({}),
  shopDomain: text("shop_domain"),
  shopifyVerifiedAt: timestamp("shopify_verified_at", { withTimezone: true }),
  deliveryEnabled: boolean("delivery_enabled").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [check("ermes_installation_singleton", sql`${table.id} = 1`)]);

export const ermesAdmin = pgTable("ermes_admin", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ermesSession = pgTable("ermes_session", {
  tokenHash: text("token_hash").primaryKey(),
  adminId: text("admin_id").notNull().references(() => ermesAdmin.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("ermes_session_expiry").on(table.expiresAt)]);

export const ermesLoginAttempt = pgTable("ermes_login_attempt", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(1),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export const ermesImageAssets = pgTable("ermes_image_asset", {
  id: uuid("id").primaryKey(),
  cloudName: text("cloud_name").notNull(),
  publicId: text("public_id").notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  bytes: integer("bytes").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("ermes_image_asset_source").on(table.cloudName, table.publicId),
  index("ermes_image_asset_created").on(table.createdAt, table.id),
]);

export const deliveryProvider = pgEnum("delivery_provider", ["resend", "medusa"]);
export const discountType = pgEnum("discount_type", ["percentage", "fixed"]);
export const emailCampaignStatus = pgEnum("email_campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);
export const emailEventType = pgEnum("email_event_type", [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "skipped",
]);
export const emailFlowStatus = pgEnum("email_flow_status", ["draft", "active", "paused"]);
export const emailFlowRunStatus = pgEnum("email_flow_run_status", [
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const productWatchAlertType = pgEnum("product_watch_alert_type", [
  "back-in-stock",
  "price-drop",
  "cart-price-drop",
]);
export const reentryMode = pgEnum("reentry_mode", ["never", "after_duration", "always"]);
export const reentryUnit = pgEnum("reentry_unit", ["hours", "days"]);
export const signupFormType = pgEnum("signup_form_type", [
  "popup",
  "flyout",
  "embedded",
  "full-page",
]);
export const signupFormStatus = pgEnum("signup_form_status", ["draft", "published"]);
export const messageChannel = pgEnum("message_channel", ["email"]);
export const suppressionReason = pgEnum("suppression_reason", [
  "bounce",
  "complaint",
  "manual",
  "unsubscribe",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const emailTemplates = pgTable(
  "email_template",
  {
    draftVersionId: text("draft_version_id"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    previewText: text("preview_text"),
    publishedVersionId: text("published_version_id"),
    subject: text("subject").notNull(),
    htmlContent: text("html_content").notNull(),
    textContent: text("text_content"),
    variables: jsonb("variables"),
    category: text("category"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_template_deleted_at").on(table.deletedAt),
    index("IDX_email_template_is_active").on(table.isActive),
    index("IDX_email_template_category").on(table.category),
  ],
);

export const emailTemplateVersions = pgTable(
  "email_template_version",
  {
    compiledHtml: text("compiled_html").notNull(),
    compiledText: text("compiled_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    document: jsonb("document"),
    editorKind: text("editor_kind").notNull().default("legacy_html"),
    id: text("id").primaryKey(),
    previewText: text("preview_text"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    subject: text("subject").notNull(),
    templateId: text("template_id").notNull(),
    variables: jsonb("variables"),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("IDX_email_template_version_template_version_unique").on(
      table.templateId,
      table.version,
    ),
    index("IDX_email_template_version_template_id").on(table.templateId),
    index("IDX_email_template_version_published_at").on(table.publishedAt),
  ],
);

export const emailFlows = pgTable(
  "email_flow",
  {
    draftVersionId: text("draft_version_id"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    messageKind: text("message_kind").notNull().default("marketing"),
    triggerEvent: text("trigger_event").notNull(),
    triggerConditions: jsonb("trigger_conditions"),
    steps: jsonb("steps").notNull(),
    tags: jsonb("tags").$type<string[]>(),
    status: emailFlowStatus("status").notNull().default("draft"),
    reentryMode: reentryMode("reentry_mode").notNull().default("never"),
    reentryDuration: integer("reentry_duration"),
    reentryUnit: reentryUnit("reentry_unit"),
    publishedVersionId: text("published_version_id"),
    triggerDelayHours: integer("trigger_delay_hours").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_flow_deleted_at").on(table.deletedAt),
    index("IDX_email_flow_status").on(table.status),
    index("IDX_email_flow_trigger_event").on(table.triggerEvent),
    index("IDX_email_flow_status_trigger").on(table.status, table.triggerEvent),
  ],
);

export const emailFlowVersions = pgTable(
  "email_flow_version",
  {
    compiledSteps: jsonb("compiled_steps").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    flowId: text("flow_id").notNull(),
    graphDocument: jsonb("graph_document").notNull(),
    id: text("id").primaryKey(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    validationReport: jsonb("validation_report"),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("IDX_email_flow_version_flow_version_unique").on(
      table.flowId,
      table.version,
    ),
    index("IDX_email_flow_version_flow_id").on(table.flowId),
    index("IDX_email_flow_version_published_at").on(table.publishedAt),
  ],
);

export const emailFlowRuns = pgTable(
  "email_flow_run",
  {
    id: text("id").primaryKey(),
    flowId: text("flow_id").notNull(),
    flowVersionId: text("flow_version_id"),
    subscriberEmail: text("subscriber_email").notNull(),
    context: jsonb("context").notNull(),
    sourceEventId: text("source_event_id"),
    stepsSnapshot: jsonb("steps_snapshot"),
    currentStepIndex: integer("current_step_index").notNull().default(0),
    status: emailFlowRunStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_flow_run_deleted_at").on(table.deletedAt),
    index("IDX_email_flow_run_flow_id").on(table.flowId),
    index("IDX_email_flow_run_status").on(table.status),
    index("IDX_email_flow_run_subscriber_email").on(table.subscriberEmail),
    index("IDX_email_flow_run_flow_status").on(table.flowId, table.status),
    uniqueIndex("IDX_email_flow_run_source_event_unique")
      .on(table.flowId, table.subscriberEmail, table.sourceEventId)
      .where(sql`source_event_id IS NOT NULL`),
  ],
);

export const emailSubscribers = pgTable(
  "email_subscriber",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    properties: jsonb("properties"),
    subscribed: boolean("subscribed").notNull().default(true),
    subscriptionSource: text("subscription_source"),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("IDX_email_subscriber_email_unique").on(table.email).where(sql`deleted_at IS NULL`),
    index("IDX_email_subscriber_deleted_at").on(table.deletedAt),
    index("IDX_email_subscriber_subscribed").on(table.subscribed),
    index("IDX_email_subscriber_source").on(table.subscriptionSource),
  ],
);

export const emailConsentEvents = pgTable(
  "email_consent_event",
  {
    action: text("action").notNull(),
    channel: messageChannel("channel").notNull().default("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    metadata: jsonb("metadata"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull(),
    topic: text("topic").notNull().default("marketing"),
  },
  (table) => [
    index("IDX_email_consent_event_email").on(table.email),
    index("IDX_email_consent_event_occurred_at").on(table.occurredAt),
    index("IDX_email_consent_event_topic_action").on(table.topic, table.action),
  ],
);

export const emailPreferenceLinks = pgTable(
  "email_preference_link",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").primaryKey(),
  },
  (table) => [
    index("IDX_email_preference_link_email").on(table.email),
    index("IDX_email_preference_link_expires_at").on(table.expiresAt),
  ],
);

export const emailSegments = pgTable(
  "email_segment",
  {
    description: text("description"),
    estimatedCount: integer("estimated_count").notNull().default(0),
    id: text("id").primaryKey(),
    lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
    name: text("name").notNull(),
    rules: jsonb("rules").notNull(),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_segment_deleted_at").on(table.deletedAt),
    index("IDX_email_segment_status").on(table.status),
  ],
);

export const emailSegmentMembers = pgTable(
  "email_segment_member",
  {
    email: text("email").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    matchedAt: timestamp("matched_at", { withTimezone: true }).notNull().defaultNow(),
    segmentId: text("segment_id").notNull(),
    subscriberId: text("subscriber_id").notNull(),
  },
  (table) => [
    uniqueIndex("IDX_email_segment_member_segment_subscriber_unique").on(
      table.segmentId,
      table.subscriberId,
    ),
    index("IDX_email_segment_member_email").on(table.email),
    index("IDX_email_segment_member_segment_id").on(table.segmentId),
  ],
);

export const emailEvents = pgTable(
  "email_event",
  {
    attributedOrderId: text("attributed_order_id"),
    attributedRevenue: doublePrecision("attributed_revenue"),
    campaignId: text("campaign_id"),
    flowStepKey: text("flow_step_key"),
    id: text("id").primaryKey(),
    flowRunId: text("flow_run_id"),
    eventType: emailEventType("event_type").notNull(),
    messageId: text("message_id"),
    metadata: jsonb("metadata"),
    providerEventId: text("provider_event_id"),
    subscriberEmail: text("subscriber_email").notNull(),
    templateId: text("template_id"),
    templateVersionId: text("template_version_id"),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_event_campaign_id").on(table.campaignId),
    index("IDX_email_event_deleted_at").on(table.deletedAt),
    index("IDX_email_event_flow_run_id").on(table.flowRunId),
    index("IDX_email_event_subscriber_email").on(table.subscriberEmail),
    index("IDX_email_event_event_type").on(table.eventType),
    index("IDX_email_event_message_id").on(table.messageId),
    uniqueIndex("IDX_email_event_provider_event_id_unique")
      .on(table.providerEventId)
      .where(sql`provider_event_id IS NOT NULL`),
    index("IDX_email_event_template_version_id").on(table.templateVersionId),
    index("IDX_email_event_created_at").on(table.createdAt),
    index("IDX_email_event_subscriber_type").on(table.subscriberEmail, table.eventType),
  ],
);

export const emailCampaigns = pgTable(
  "email_campaign",
  {
    draftRevisionId: text("draft_revision_id"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    subject: text("subject").notNull(),
    templateId: text("template_id").notNull(),
    subscriberFilter: jsonb("subscriber_filter"),
    status: emailCampaignStatus("status").notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sendRevisionId: text("send_revision_id"),
    audienceSnapshottedAt: timestamp("audience_snapshotted_at", {
      withTimezone: true,
    }),
    recipientCount: integer("recipient_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    context: jsonb("context"),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_campaign_deleted_at").on(table.deletedAt),
    index("IDX_email_campaign_status").on(table.status),
    index("IDX_email_campaign_scheduled_at").on(table.scheduledAt),
  ],
);

export const emailCampaignRevisions = pgTable(
  "email_campaign_revision",
  {
    audienceDefinition: jsonb("audience_definition"),
    campaignId: text("campaign_id").notNull(),
    context: jsonb("context"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    replyTo: text("reply_to"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    senderEmail: text("sender_email"),
    senderName: text("sender_name"),
    subject: text("subject").notNull(),
    templateId: text("template_id").notNull(),
    templateVersionId: text("template_version_id").notNull(),
    utm: jsonb("utm"),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("IDX_email_campaign_revision_campaign_version_unique").on(
      table.campaignId,
      table.version,
    ),
    index("IDX_email_campaign_revision_campaign_id").on(table.campaignId),
    index("IDX_email_campaign_revision_frozen_at").on(table.frozenAt),
  ],
);

export const emailProductWatches = pgTable(
  "email_product_watch",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    productId: text("product_id").notNull(),
    variantId: text("variant_id"),
    alertType: productWatchAlertType("alert_type").notNull(),
    referencePrice: doublePrecision("reference_price"),
    currencyCode: text("currency_code"),
    context: jsonb("context"),
    notified: boolean("notified").notNull().default(false),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_product_watch_deleted_at").on(table.deletedAt),
    index("IDX_email_product_watch_email").on(table.email),
    index("IDX_email_product_watch_product_id").on(table.productId),
    index("IDX_email_product_watch_alert_type").on(table.alertType),
    index("IDX_email_product_watch_notified").on(table.notified),
    index("IDX_email_product_watch_alert_notified").on(table.alertType, table.notified),
    uniqueIndex("IDX_email_product_watch_unique")
      .on(table.email, table.productId, table.variantId, table.alertType)
      .where(sql`deleted_at IS NULL AND notified = false`),
  ],
);

export const emailDiscountCodes = pgTable(
  "email_discount_code",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    promotionId: text("promotion_id"),
    flowId: text("flow_id").notNull(),
    flowRunId: text("flow_run_id").notNull(),
    stepKey: text("step_key"),
    subscriberEmail: text("subscriber_email").notNull(),
    discountType: discountType("discount_type").notNull(),
    discountValue: doublePrecision("discount_value").notNull(),
    currencyCode: text("currency_code"),
    usageLimit: integer("usage_limit").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    orderId: text("order_id"),
    ...timestamps,
  },
  (table) => [
    index("IDX_email_discount_code_deleted_at").on(table.deletedAt),
    index("IDX_email_discount_code_code").on(table.code),
    index("IDX_email_discount_code_subscriber_email").on(table.subscriberEmail),
    index("IDX_email_discount_code_flow_id").on(table.flowId),
    uniqueIndex("IDX_email_discount_code_flow_run_step_unique")
      .on(table.flowRunId, table.stepKey)
      .where(sql`step_key IS NOT NULL`),
  ],
);

export const commerceEvents = pgTable(
  "commerce_event",
  {
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    source: text("source").notNull().default("commerce"),
  },
  (table) => [
    uniqueIndex("commerce_event_event_id_idx").on(table.eventId),
    index("commerce_event_event_type_idx").on(table.eventType),
    index("commerce_event_processed_at_idx").on(table.processedAt),
    index("commerce_event_received_at_idx").on(table.receivedAt),
  ],
);

export const integrationDeliveries = pgTable(
  "integration_delivery",
  {
    attemptCount: integer("attempt_count").notNull().default(0),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    error: text("error"),
    eventId: text("event_id").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    provider: deliveryProvider("provider").notNull(),
    request: jsonb("request").notNull().default(sql`'{}'::jsonb`),
    response: jsonb("response"),
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    uniqueIndex("integration_delivery_provider_event_idx").on(table.provider, table.eventId),
    index("integration_delivery_status_idx").on(table.status),
  ],
);

export const signupForms = pgTable(
  "signup_form",
  {
    draftVersionId: text("draft_version_id"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    type: signupFormType("type").notNull().default("popup"),
    status: signupFormStatus("status").notNull().default("draft"),
    document: jsonb("document").notNull(),
    discountFlowId: text("discount_flow_id"),
    submitted: integer("submitted").notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedVersionId: text("published_version_id"),
    ...timestamps,
  },
  (table) => [
    index("IDX_signup_form_deleted_at").on(table.deletedAt),
    index("IDX_signup_form_status").on(table.status),
    index("IDX_signup_form_type").on(table.type),
    index("IDX_signup_form_status_type").on(table.status, table.type),
  ],
);

export const signupFormVersions = pgTable(
  "signup_form_version",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
    document: jsonb("document").notNull(),
    formId: text("form_id").notNull(),
    id: text("id").primaryKey(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    schemaVersion: integer("schema_version").notNull().default(1),
    version: integer("version").notNull(),
  },
  (table) => [
    uniqueIndex("IDX_signup_form_version_form_version_unique").on(
      table.formId,
      table.version,
    ),
    index("IDX_signup_form_version_form_id").on(table.formId),
    index("IDX_signup_form_version_published_at").on(table.publishedAt),
  ],
);

export const messageSuppressions = pgTable(
  "message_suppression",
  {
    active: boolean("active").notNull().default(true),
    channel: messageChannel("channel").notNull().default("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    email: text("email").notNull(),
    id: uuid("id").primaryKey().defaultRandom(),
    reason: suppressionReason("reason").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("message_suppression_email_channel_reason_idx").on(
      table.email,
      table.channel,
      table.reason,
    ),
    index("message_suppression_active_idx").on(table.active),
  ],
);

export const emailDeliveryLedger = pgTable(
  "email_delivery_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: text("idempotency_key").notNull(),
    flowId: text("flow_id"),
    flowRunId: text("flow_run_id"),
    flowVersionId: text("flow_version_id"),
    campaignId: text("campaign_id"),
    campaignRecipientId: uuid("campaign_recipient_id"),
    campaignRevisionId: text("campaign_revision_id"),
    recipientEmail: text("recipient_email").notNull(),
    templateId: text("template_id").notNull(),
    templateVersionId: text("template_version_id"),
    messageKind: text("message_kind").notNull(),
    state: text("state").notNull().default("pending"),
    providerId: text("provider_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("IDX_email_delivery_ledger_idempotency_key_unique").on(table.idempotencyKey),
    index("IDX_email_delivery_ledger_flow_run").on(table.flowRunId),
    index("IDX_email_delivery_ledger_campaign").on(table.campaignId),
    index("IDX_email_delivery_ledger_state_claim").on(table.state, table.claimExpiresAt),
  ],
);

export const emailMarketingSendStates = pgTable(
  "email_marketing_send_state",
  {
    email: text("email").primaryKey(),
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
    }).notNull(),
    lastSource: text("last_source").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_email_marketing_send_state_last_attempt").on(
      table.lastAttemptAt,
    ),
  ],
);

export const emailCampaignRecipients = pgTable(
  "email_campaign_recipient",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: text("campaign_id").notNull(),
    campaignRevisionId: text("campaign_revision_id"),
    subscriberId: text("subscriber_id"),
    email: text("email").notNull(),
    state: text("state").notNull().default("pending"),
    deliveryKey: text("delivery_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    providerId: text("provider_id"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("IDX_email_campaign_recipient_campaign_email_unique").on(
      table.campaignId,
      table.email,
    ),
    uniqueIndex("IDX_email_campaign_recipient_delivery_key_unique").on(table.deliveryKey),
    index("IDX_email_campaign_recipient_state_claim").on(
      table.campaignId,
      table.state,
      table.claimExpiresAt,
    ),
  ],
);

export const adminAuditLogs = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id").notNull(),
    outcome: text("outcome").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_admin_audit_log_created_at").on(table.createdAt),
    index("IDX_admin_audit_log_request_id").on(table.requestId),
  ],
);

export const publicRateLimits = pgTable(
  "public_rate_limit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("IDX_public_rate_limit_bucket_unique").on(
      table.action,
      table.keyHash,
      table.windowStart,
    ),
    index("IDX_public_rate_limit_expires_at").on(table.expiresAt),
  ],
);

export const runtimeSettings = pgTable("runtime_setting", {
  key: text("key").primaryKey(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  value: jsonb("value").notNull(),
});

// Connector state is per shop so a changed installation can never replay another
// store's cursors, webhook jobs or recovery identities.
export const shopifyConnectors = pgTable("shopify_connector", {
  shopDomain: text("shop_domain").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  cursors: jsonb("cursors").notNull().default({}),
  lastWebhookAt: timestamp("last_webhook_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastRecoveryAt: timestamp("last_recovery_at", { withTimezone: true }),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const shopifyWebhooks = pgTable("shopify_webhook", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, t => [index("shopify_webhook_ready").on(t.state, t.nextAttemptAt)]);
export const shopifyObjects = pgTable("shopify_object", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  kind: text("kind").notNull(),
  externalId: text("external_id").notNull(),
  payload: jsonb("payload").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("shopify_object_source").on(t.shopDomain, t.kind, t.externalId)]);
export const shopifyRecoveries = pgTable("shopify_recovery", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  kind: text("kind").notNull(),
  sourceKey: text("source_key").notNull(),
  cartKey: text("cart_key"),
  email: text("email"),
  customerId: text("customer_id"),
  state: text("state").notNull().default("watching"),
  snapshot: jsonb("snapshot").notNull().default({}),
  lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  emittedAt: timestamp("emitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("shopify_recovery_source").on(t.shopDomain, t.kind, t.sourceKey), index("shopify_recovery_ready").on(t.state,t.nextAttemptAt), index("shopify_recovery_email").on(t.shopDomain,t.email)]);
export const shopifyCommands = pgTable("shopify_command", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  result: jsonb("result"),
  state: text("state").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [index("shopify_command_ready").on(t.state,t.nextAttemptAt)]);
export const shopifyFormEvents = pgTable("shopify_form_event", {
  id: text("id").primaryKey(),
  formId: text("form_id").notNull(),
  eventType: text("event_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
