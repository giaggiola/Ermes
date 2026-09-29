import { installationRow } from "./installation.js";
import { createHash, randomBytes } from "node:crypto";

import {
  and,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  type CampaignFilter,
  compileEmailDocument,
  createId,
  evaluateSegmentRules,
  evaluateTriggerConditions,
  type FlowStep,
  type FlowTriggerResult,
  getFlowReentryDecision,
  getSuppressionDecision,
  type MessageKind,
  normalizeEmail,
  queueNames,
  resolveFlowMessageKind,
  selectStandardFlowRecipes,
  sendJob,
  type SegmentRuleGroup,
  type SignupFormType,
  type SubscriberProperties,
  type TriggerConditionInput,
  validateFlowSteps,
} from "@ermes/core";

import { getDb, type EilishMessagingDb } from "./client.js";
import {
  adminAuditLogs,
  commerceEvents,
  emailCampaignRevisions,
  emailCampaignRecipients,
  emailCampaigns,
  emailConsentEvents,
  emailDeliveryLedger,
  emailDiscountCodes,
  emailEvents,
  emailFlowVersions,
  emailFlowRuns,
  emailFlows,
  emailMarketingSendStates,
  emailPreferenceLinks,
  emailProductWatches,
  emailSegmentMembers,
  emailSegments,
  emailSubscribers,
  emailTemplates,
  emailTemplateVersions,
  integrationDeliveries,
  messageSuppressions,
  publicRateLimits,
  runtimeSettings,
  signupForms,
  signupFormVersions,
} from "./schema.js";

type AnyRecord = Record<string, unknown>;
type RowInput = AnyRecord | AnyRecord[];
type UpdateRowsResult<T extends RowInput> = T extends AnyRecord[]
  ? AnyRecord[]
  : AnyRecord | undefined;
// Drizzle keeps strong table types for concrete queries, but this service selects
// several tables dynamically through one CRUD helper. Keep the loose casts local
// to that helper instead of weakening the public service surface.
type DynamicTable = any;
type DynamicColumn = any;

export interface MessagingRuntimeSettings {
  emailFrom: string;
  emailLogoUrl: string;
  emailSenderName: string;
  source: "database" | "environment" | "defaults";
}

export interface MessagingRuntimeSettingsUpdate {
  emailFrom?: string;
  emailLogoUrl?: string;
  emailSenderName?: string;
}

const RUNTIME_SETTING_KEYS = {
  emailFrom: "email_from",
  emailLogoUrl: "email_logo_url",
  emailSenderName: "email_sender_name",
} as const;

const runtimeDefaults = {
  emailFrom: "hello@example.com",
  emailLogoUrl: "",
  emailSenderName: "Your store",
};

const PREFERENCE_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const PREFERENCE_LINK_TTL_SECONDS = 365 * 24 * 60 * 60;

function preferenceLinkTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function runtimeString(value: unknown, allowEmpty = false) {
  return typeof value === "string" && (allowEmpty || value.length > 0)
    ? value
    : undefined;
}

function isValidEmailLogoUrl(value: string) {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function applyStandardEmailStepSafety(
  currentSteps: unknown,
  recipeSteps: FlowStep[],
): { changed: boolean; steps: FlowStep[] } {
  const current = Array.isArray(currentSteps)
    ? (currentSteps as FlowStep[])
    : [];
  const recipeEmailSteps = new Map(
    recipeSteps
      .filter((step) => step.type === "email")
      .map((step) => [step.step_id ?? step.template_id, step]),
  );
  let changed = false;

  const merge = (steps: FlowStep[]): FlowStep[] =>
    steps.map((step) => {
      if (step.type === "condition") {
        const trueBranch = merge(step.true_branch ?? []);
        const falseBranch = merge(step.false_branch ?? []);
        if (
          JSON.stringify(trueBranch) !==
            JSON.stringify(step.true_branch ?? []) ||
          JSON.stringify(falseBranch) !==
            JSON.stringify(step.false_branch ?? [])
        ) {
          changed = true;
          return {
            ...step,
            false_branch: falseBranch,
            true_branch: trueBranch,
          };
        }
        return step;
      }
      if (step.type !== "email") {
        return step;
      }

      const recipeStep = recipeEmailSteps.get(step.step_id ?? step.template_id);
      if (!recipeStep || recipeStep.type !== "email") {
        return step;
      }
      const next = {
        ...step,
        skip_if_event_types_since_start:
          recipeStep.skip_if_event_types_since_start,
        skip_if_event_types_since_start_order_scoped:
          recipeStep.skip_if_event_types_since_start_order_scoped,
        skip_recently_emailed: recipeStep.skip_recently_emailed,
        skip_recently_emailed_hours: recipeStep.skip_recently_emailed_hours,
      };
      if (JSON.stringify(next) !== JSON.stringify(step)) {
        changed = true;
      }
      return next;
    });

  const steps = merge(current);
  return { changed, steps };
}

const deliverabilityEventTypes = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
] as const;

type DeliverabilityEventType = (typeof deliverabilityEventTypes)[number];
type DeliverabilityCounts = Record<
  DeliverabilityEventType | "unsubscribed",
  number
>;

function isDeliverabilityEventType(
  value: string,
): value is DeliverabilityEventType {
  return deliverabilityEventTypes.includes(value as DeliverabilityEventType);
}

function emptyDeliverabilityCounts(): DeliverabilityCounts {
  return {
    bounced: 0,
    clicked: 0,
    complained: 0,
    delivered: 0,
    opened: 0,
    sent: 0,
    unsubscribed: 0,
  };
}

function deliverabilityRate(count: number, sent: number) {
  return sent > 0 ? Math.round((count / sent) * 1000) / 10 : 0;
}

function withDeliverabilityRates(counts: DeliverabilityCounts) {
  return {
    ...counts,
    bounce_rate: deliverabilityRate(counts.bounced, counts.sent),
    click_rate: deliverabilityRate(counts.clicked, counts.sent),
    complaint_rate: deliverabilityRate(counts.complained, counts.sent),
    delivery_rate: deliverabilityRate(counts.delivered, counts.sent),
    open_rate: deliverabilityRate(counts.opened, counts.sent),
    unsubscribe_rate: deliverabilityRate(counts.unsubscribed, counts.sent),
  };
}

const tableConfigs = {
  emailCampaigns: { table: emailCampaigns, prefix: "emcamp" },
  emailDiscountCodes: { table: emailDiscountCodes, prefix: "emdisc" },
  emailEvents: { table: emailEvents, prefix: "emevt" },
  emailFlowRuns: { table: emailFlowRuns, prefix: "emrun" },
  emailFlows: { table: emailFlows, prefix: "emflow" },
  emailProductWatches: { table: emailProductWatches, prefix: "emwatch" },
  emailSubscribers: { table: emailSubscribers, prefix: "emsub" },
  emailSegments: { table: emailSegments, prefix: "emseg" },
  emailTemplates: { table: emailTemplates, prefix: "emtpl" },
  signupForms: { table: signupForms, prefix: "form" },
} as const;

const keyAliases: Record<string, string> = {
  alert_type: "alertType",
  attempt_count: "attemptCount",
  audience_snapshotted_at: "audienceSnapshottedAt",
  attributed_order_id: "attributedOrderId",
  attributed_revenue: "attributedRevenue",
  campaign_revision_id: "campaignRevisionId",
  claim_expires_at: "claimExpiresAt",
  claimed_at: "claimedAt",
  completed_at: "completedAt",
  compiled_html: "compiledHtml",
  compiled_steps: "compiledSteps",
  compiled_text: "compiledText",
  created_at: "createdAt",
  created_by: "createdBy",
  current_step_index: "currentStepIndex",
  currency_code: "currencyCode",
  deleted_at: "deletedAt",
  delivered_at: "deliveredAt",
  discount_flow_id: "discountFlowId",
  discount_type: "discountType",
  discount_value: "discountValue",
  draft_revision_id: "draftRevisionId",
  draft_version_id: "draftVersionId",
  delivery_key: "deliveryKey",
  error_message: "errorMessage",
  event_id: "eventId",
  event_type: "eventType",
  editor_kind: "editorKind",
  expires_at: "expiresAt",
  failed_count: "failedCount",
  first_name: "firstName",
  flow_id: "flowId",
  flow_run_id: "flowRunId",
  flow_step_key: "flowStepKey",
  flow_version_id: "flowVersionId",
  form_id: "formId",
  frozen_at: "frozenAt",
  graph_document: "graphDocument",
  html_content: "htmlContent",
  is_active: "isActive",
  last_attempt_at: "lastAttemptAt",
  last_evaluated_at: "lastEvaluatedAt",
  last_name: "lastName",
  message_id: "messageId",
  message_kind: "messageKind",
  matched_at: "matchedAt",
  preview_text: "previewText",
  provider_event_id: "providerEventId",
  notified_at: "notifiedAt",
  order_id: "orderId",
  occurred_at: "occurredAt",
  processed_at: "processedAt",
  product_id: "productId",
  promotion_id: "promotionId",
  provider_id: "providerId",
  published_at: "publishedAt",
  published_version_id: "publishedVersionId",
  received_at: "receivedAt",
  recipient_count: "recipientCount",
  redeemed_at: "redeemedAt",
  reentry_duration: "reentryDuration",
  reentry_mode: "reentryMode",
  reentry_unit: "reentryUnit",
  reply_to: "replyTo",
  reference_price: "referencePrice",
  scheduled_at: "scheduledAt",
  schema_version: "schemaVersion",
  send_revision_id: "sendRevisionId",
  sender_email: "senderEmail",
  sender_name: "senderName",
  sent_at: "sentAt",
  sent_count: "sentCount",
  segment_id: "segmentId",
  source_event_id: "sourceEventId",
  started_at: "startedAt",
  state: "state",
  step_key: "stepKey",
  steps_snapshot: "stepsSnapshot",
  subscriber_email: "subscriberEmail",
  subscriber_id: "subscriberId",
  subscriber_filter: "subscriberFilter",
  subscribed_at: "subscribedAt",
  subscription_source: "subscriptionSource",
  template_id: "templateId",
  template_version_id: "templateVersionId",
  text_content: "textContent",
  trigger_conditions: "triggerConditions",
  trigger_delay_hours: "triggerDelayHours",
  trigger_event: "triggerEvent",
  validation_report: "validationReport",
  unsubscribed_at: "unsubscribedAt",
  updated_at: "updatedAt",
  usage_limit: "usageLimit",
  variant_id: "variantId",
};

const reverseAliases = Object.fromEntries(
  Object.entries(keyAliases).map(([snake, camel]) => [camel, snake]),
);

function normalizeRecord(record: AnyRecord = {}): AnyRecord {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const normalizedKey = keyAliases[key] ?? key;
        return [normalizedKey, coerceValue(normalizedKey, value)];
      }),
  );
}

function coerceValue(key: string, value: unknown): unknown {
  if (value == null || typeof value !== "string") {
    return value;
  }

  if (key.endsWith("At") || key === "startedAt" || key === "completedAt") {
    return new Date(value);
  }

  return value;
}

function toPublicRecord(row: AnyRecord): AnyRecord {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      reverseAliases[key] ?? key,
      value,
    ]),
  );
}

function profileForSegment(subscriber: AnyRecord): AnyRecord {
  const properties =
    subscriber.properties && typeof subscriber.properties === "object"
      ? (subscriber.properties as AnyRecord)
      : {};
  return {
    ...subscriber,
    properties,
    tags: Array.isArray(properties.tags) ? properties.tags : [],
  };
}

function getColumn(
  table: DynamicTable,
  key: string,
): DynamicColumn | undefined {
  return table[key] as DynamicColumn | undefined;
}

function buildWhere(
  table: DynamicTable,
  filter: AnyRecord = {},
  includeDeleted = false,
) {
  const normalized = normalizeRecord(filter);
  const conditions: DynamicColumn[] = [];

  if (!includeDeleted && "deletedAt" in table && !("deletedAt" in normalized)) {
    conditions.push(isNull(table.deletedAt as DynamicColumn));
  }

  for (const [key, value] of Object.entries(normalized)) {
    if (key === "includeDeleted") {
      continue;
    }

    const column = getColumn(table, key);
    if (!column || value === undefined) {
      continue;
    }

    if (value === null) {
      conditions.push(isNull(column));
      continue;
    }

    if (Array.isArray(value)) {
      conditions.push(inArray(column, value));
      continue;
    }

    if (typeof value === "object" && !(value instanceof Date)) {
      const operatorRecord = value as Record<string, unknown>;
      if ("$gt" in operatorRecord)
        conditions.push(gt(column, coerceValue(key, operatorRecord.$gt)));
      if ("$gte" in operatorRecord)
        conditions.push(gte(column, coerceValue(key, operatorRecord.$gte)));
      if ("$lt" in operatorRecord)
        conditions.push(lt(column, coerceValue(key, operatorRecord.$lt)));
      if ("$lte" in operatorRecord)
        conditions.push(lte(column, coerceValue(key, operatorRecord.$lte)));
      if ("$ne" in operatorRecord)
        conditions.push(ne(column, coerceValue(key, operatorRecord.$ne)));
      continue;
    }

    conditions.push(eq(column, value));
  }

  return conditions.length ? and(...conditions) : undefined;
}

async function listRows(
  db: EilishMessagingDb,
  table: DynamicTable,
  filter: AnyRecord = {},
) {
  const includeDeleted = filter.includeDeleted === true;
  const where = buildWhere(table, filter, includeDeleted);
  let query = db.select().from(table).$dynamic();
  if (where) {
    query = query.where(where);
  }

  const createdAt = table.createdAt as DynamicColumn | undefined;
  if (createdAt) {
    query = query.orderBy(desc(createdAt));
  }

  return ((await query) as AnyRecord[]).map((row) => toPublicRecord(row));
}

async function retrieveRow(
  db: EilishMessagingDb,
  table: DynamicTable,
  id: string,
) {
  const rows = await listRows(db, table, { id });
  if (rows.length === 0) {
    throw new Error(`Record not found: ${id}`);
  }

  return rows[0];
}

async function createRows(
  db: EilishMessagingDb,
  table: DynamicTable,
  rows: AnyRecord[],
  prefix: string,
) {
  if (rows.length === 0) {
    return [];
  }

  const values = rows.map((row) => ({
    id: row.id ?? createId(prefix),
    ...normalizeRecord(row),
  }));

  const inserted = await db.insert(table).values(values).returning();
  return (inserted as AnyRecord[]).map((row) => toPublicRecord(row));
}

async function updateRows<T extends RowInput>(
  db: EilishMessagingDb,
  table: DynamicTable,
  input: T,
): Promise<UpdateRowsResult<T>> {
  const rows = Array.isArray(input) ? input : [input];
  const updated = [];

  for (const row of rows) {
    if (!row.id || typeof row.id !== "string") {
      throw new Error("id is required for update");
    }

    const values = normalizeRecord(row);
    delete values.id;
    values.updatedAt = new Date();

    const result = await db
      .update(table)
      .set(values)
      .where(eq(table.id as DynamicColumn, row.id))
      .returning();

    if (result[0]) {
      updated.push(toPublicRecord(result[0] as AnyRecord));
    }
  }

  return (Array.isArray(input) ? updated : updated[0]) as UpdateRowsResult<T>;
}

async function deleteRows(
  db: EilishMessagingDb,
  table: DynamicTable,
  ids: string | string[],
) {
  const normalizedIds = Array.isArray(ids) ? ids : [ids];
  if (normalizedIds.length === 0) {
    return;
  }

  await db
    .update(table)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(inArray(table.id as DynamicColumn, normalizedIds));
}

export class MessagingService {
  constructor(private readonly db: EilishMessagingDb = getDb()) {}

  private async withVersionLock<T>(
    scope: string,
    operation: (db: EilishMessagingDb) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as EilishMessagingDb;
      await db.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`messaging-version:${scope}`}))`,
      );
      return operation(db);
    });
  }

  async listEmailTemplates(filter: AnyRecord = {}) {
    const templates = await listRows(
      this.db,
      tableConfigs.emailTemplates.table,
      filter,
    );
    return Promise.all(
      templates.map((template) =>
        this.enrichEmailTemplateWithDraftVersion(template),
      ),
    );
  }

  async retrieveEmailTemplate(id: string) {
    const template = await retrieveRow(
      this.db,
      tableConfigs.emailTemplates.table,
      id,
    );
    return this.enrichEmailTemplateWithDraftVersion(template);
  }

  private async enrichEmailTemplateWithDraftVersion(template: AnyRecord) {
    if (typeof template.draft_version_id !== "string") {
      return template;
    }
    const version = await this.retrieveEmailTemplateVersion(
      template.draft_version_id,
    );
    return {
      ...template,
      document: version.document,
      editor_kind: version.editor_kind,
      version: version.version,
    };
  }

  async listEmailTemplateVersions(templateId: string) {
    const rows = await this.db
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.templateId, templateId))
      .orderBy(desc(emailTemplateVersions.version));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async retrieveEmailTemplateVersion(id: string) {
    const [row] = await this.db
      .select()
      .from(emailTemplateVersions)
      .where(eq(emailTemplateVersions.id, id))
      .limit(1);
    if (!row) {
      throw new Error(`Template version not found: ${id}`);
    }
    return toPublicRecord(row as AnyRecord);
  }

  async publishEmailTemplateVersion(templateId: string, versionId?: string) {
    const template = await this.retrieveEmailTemplate(templateId);
    const targetId =
      versionId ??
      (typeof template.draft_version_id === "string"
        ? template.draft_version_id
        : null);
    if (!targetId) {
      throw new Error(`Template ${templateId} has no draft version`);
    }
    const version = await this.retrieveEmailTemplateVersion(targetId);
    if (String(version.template_id) !== templateId) {
      throw new Error(
        `Template version ${targetId} does not belong to ${templateId}`,
      );
    }
    const publishedAt = new Date();
    await this.db
      .update(emailTemplateVersions)
      .set({ publishedAt })
      .where(eq(emailTemplateVersions.id, targetId));
    await this.db
      .update(emailTemplates)
      .set({
        htmlContent: String(version.compiled_html),
        previewText:
          typeof version.preview_text === "string"
            ? version.preview_text
            : null,
        publishedVersionId: targetId,
        subject: String(version.subject),
        textContent:
          typeof version.compiled_text === "string"
            ? version.compiled_text
            : null,
        updatedAt: publishedAt,
        variables: version.variables ?? null,
      })
      .where(eq(emailTemplates.id, templateId));
    return this.retrieveEmailTemplateVersion(targetId);
  }

  async resolveEmailTemplateForDelivery(
    templateId: string,
    templateVersionId?: string | null,
  ) {
    const template = await this.retrieveEmailTemplate(templateId);
    const versionId =
      templateVersionId ??
      (typeof template.published_version_id === "string"
        ? template.published_version_id
        : typeof template.draft_version_id === "string"
          ? template.draft_version_id
          : null);
    if (!versionId) {
      return template;
    }

    const version = await this.retrieveEmailTemplateVersion(versionId);
    if (String(version.template_id) !== templateId) {
      throw new Error(
        `Template version ${versionId} does not belong to ${templateId}`,
      );
    }
    return {
      ...template,
      html_content: version.compiled_html,
      preview_text: version.preview_text,
      subject: version.subject,
      template_version_id: version.id,
      text_content: version.compiled_text,
      variables: version.variables,
    };
  }

  private async snapshotEmailTemplateVersion(
    templateId: string,
    options: {
      createdBy?: string | null;
      document?: unknown;
      editorKind?: string;
      publish?: boolean;
    } = {},
  ) {
    return this.withVersionLock(`template:${templateId}`, async (db) => {
      const template = await retrieveRow(db, emailTemplates, templateId);
      const [latest] = await db
        .select({
          version: sql<number>`coalesce(max(${emailTemplateVersions.version}), 0)::int`,
        })
        .from(emailTemplateVersions)
        .where(eq(emailTemplateVersions.templateId, templateId));
      const id = createId("emtv");
      const publishedAt = options.publish ? new Date() : null;
      const [version] = await db
        .insert(emailTemplateVersions)
        .values({
          compiledHtml: String(template.html_content),
          compiledText:
            typeof template.text_content === "string"
              ? template.text_content
              : null,
          createdBy: options.createdBy ?? null,
          document: options.document ?? null,
          editorKind: options.editorKind ?? "legacy_html",
          id,
          previewText:
            typeof template.preview_text === "string"
              ? template.preview_text
              : null,
          publishedAt,
          subject: String(template.subject),
          templateId,
          variables: template.variables ?? null,
          version: Number(latest?.version ?? 0) + 1,
        })
        .returning();

      await db
        .update(emailTemplates)
        .set({
          draftVersionId: id,
          ...(publishedAt ? { publishedVersionId: id } : {}),
          updatedAt: new Date(),
        })
        .where(eq(emailTemplates.id, templateId));

      return toPublicRecord(version as AnyRecord);
    });
  }

  async createEmailTemplates(rows: AnyRecord[]) {
    const sanitized = rows.map(
      ({ document, editor_kind: editorKind, _publish: _publish, ...row }) => {
        if (editorKind === "visual_v1") {
          const compiled = compileEmailDocument(document);
          return {
            ...row,
            html_content: compiled.html,
            text_content: compiled.text,
          };
        }
        return row;
      },
    );
    const created = await createRows(
      this.db,
      tableConfigs.emailTemplates.table,
      sanitized,
      tableConfigs.emailTemplates.prefix,
    );
    for (let index = 0; index < created.length; index++) {
      await this.snapshotEmailTemplateVersion(String(created[index].id), {
        document: rows[index]?.document,
        editorKind:
          typeof rows[index]?.editor_kind === "string"
            ? String(rows[index]?.editor_kind)
            : "legacy_html",
        publish: rows[index]?._publish === true,
      });
    }
    return Promise.all(
      created.map((row) => this.retrieveEmailTemplate(String(row.id))),
    );
  }

  async updateEmailTemplates<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    const sanitized = rows.map(
      ({ document, editor_kind: editorKind, _publish: _publish, ...row }) => {
        if (editorKind === "visual_v1") {
          const compiled = compileEmailDocument(document);
          return {
            ...row,
            html_content: compiled.html,
            text_content: compiled.text,
          };
        }
        return row;
      },
    );
    await updateRows(
      this.db,
      tableConfigs.emailTemplates.table,
      Array.isArray(input) ? sanitized : sanitized[0],
    );
    for (const row of rows) {
      await this.snapshotEmailTemplateVersion(String(row.id), {
        document: row.document,
        editorKind:
          typeof row.editor_kind === "string"
            ? String(row.editor_kind)
            : "legacy_html",
        publish: row._publish === true,
      });
    }
    if (Array.isArray(input)) {
      return (await Promise.all(
        rows.map((row) => this.retrieveEmailTemplate(String(row.id))),
      )) as UpdateRowsResult<T>;
    }
    return (await this.retrieveEmailTemplate(
      String(rows[0].id),
    )) as UpdateRowsResult<T>;
  }

  deleteEmailTemplates(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailTemplates.table, ids);
  }

  async listEmailFlows(filter: AnyRecord = {}) {
    const flows = await listRows(
      this.db,
      tableConfigs.emailFlows.table,
      filter,
    );
    return Promise.all(
      flows.map((flow) => this.enrichEmailFlowWithDraftVersion(flow)),
    );
  }

  async retrieveEmailFlow(id: string) {
    const flow = await retrieveRow(this.db, tableConfigs.emailFlows.table, id);
    return this.enrichEmailFlowWithDraftVersion(flow);
  }

  private async enrichEmailFlowWithDraftVersion(flow: AnyRecord) {
    if (typeof flow.draft_version_id !== "string") {
      return flow;
    }
    const version = await this.retrieveEmailFlowVersion(flow.draft_version_id);
    return {
      ...flow,
      graph_document: version.graph_document,
      validation_report: version.validation_report,
      version: version.version,
    };
  }

  async listEmailFlowVersions(flowId: string) {
    const rows = await this.db
      .select()
      .from(emailFlowVersions)
      .where(eq(emailFlowVersions.flowId, flowId))
      .orderBy(desc(emailFlowVersions.version));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async retrieveEmailFlowVersion(id: string) {
    const [row] = await this.db
      .select()
      .from(emailFlowVersions)
      .where(eq(emailFlowVersions.id, id))
      .limit(1);
    if (!row) {
      throw new Error(`Flow version not found: ${id}`);
    }
    return toPublicRecord(row as AnyRecord);
  }

  async publishEmailFlowVersion(flowId: string, versionId?: string) {
    const flow = await this.retrieveEmailFlow(flowId);
    const targetId =
      versionId ??
      (typeof flow.draft_version_id === "string"
        ? flow.draft_version_id
        : null);
    if (!targetId) {
      throw new Error(`Flow ${flowId} has no draft version`);
    }
    const version = await this.retrieveEmailFlowVersion(targetId);
    if (String(version.flow_id) !== flowId) {
      throw new Error(`Flow version ${targetId} does not belong to ${flowId}`);
    }
    const report = version.validation_report as AnyRecord | null;
    if (report?.valid !== true) {
      throw new Error("Flow version is not valid and cannot be published");
    }
    const publishedAt = new Date();
    await this.db
      .update(emailFlowVersions)
      .set({ publishedAt })
      .where(eq(emailFlowVersions.id, targetId));
    await this.db
      .update(emailFlows)
      .set({
        publishedVersionId: targetId,
        status: "active",
        steps: version.compiled_steps,
        updatedAt: publishedAt,
      })
      .where(eq(emailFlows.id, flowId));
    return this.retrieveEmailFlowVersion(targetId);
  }

  async getFlowExecutionSnapshot(flowId: string) {
    const flow = await this.retrieveEmailFlow(flowId);
    const versionId =
      typeof flow.published_version_id === "string"
        ? flow.published_version_id
        : typeof flow.draft_version_id === "string"
          ? flow.draft_version_id
          : null;
    if (!versionId) {
      return { flow, flowVersionId: null, steps: flow.steps as unknown[] };
    }
    const version = await this.retrieveEmailFlowVersion(versionId);
    return {
      flow,
      flowVersionId: String(version.id),
      steps: version.compiled_steps as unknown[],
    };
  }

  private async snapshotEmailFlowVersion(
    flowId: string,
    options: {
      createdBy?: string | null;
      graphDocument?: unknown;
      publish?: boolean;
    } = {},
  ) {
    return this.withVersionLock(`flow:${flowId}`, async (db) => {
      const flow = await retrieveRow(db, emailFlows, flowId);
      const [latest] = await db
        .select({
          version: sql<number>`coalesce(max(${emailFlowVersions.version}), 0)::int`,
        })
        .from(emailFlowVersions)
        .where(eq(emailFlowVersions.flowId, flowId));
      const id = createId("emfv");
      const steps = Array.isArray(flow.steps) ? flow.steps : [];
      const publishedAt = options.publish ? new Date() : null;
      const graphDocument = options.graphDocument ?? {
        schema_version: 1,
        steps,
        trigger_conditions: flow.trigger_conditions ?? [],
        trigger_event: flow.trigger_event,
      };
      const validationReport = validateFlowSteps(steps);
      const [version] = await db
        .insert(emailFlowVersions)
        .values({
          compiledSteps: steps,
          createdBy: options.createdBy ?? null,
          flowId,
          graphDocument,
          id,
          publishedAt,
          validationReport,
          version: Number(latest?.version ?? 0) + 1,
        })
        .returning();
      await db
        .update(emailFlows)
        .set({
          draftVersionId: id,
          ...(publishedAt ? { publishedVersionId: id } : {}),
          updatedAt: new Date(),
        })
        .where(eq(emailFlows.id, flowId));
      return toPublicRecord(version as AnyRecord);
    });
  }

  async createEmailFlows(rows: AnyRecord[]) {
    const sanitized = rows.map(
      ({ graph_document: _graphDocument, ...row }) => row,
    );
    const created = await createRows(
      this.db,
      tableConfigs.emailFlows.table,
      sanitized,
      tableConfigs.emailFlows.prefix,
    );
    for (let index = 0; index < created.length; index++) {
      await this.snapshotEmailFlowVersion(String(created[index].id), {
        graphDocument: rows[index]?.graph_document,
        publish: created[index].status === "active",
      });
    }
    return Promise.all(
      created.map((row) => this.retrieveEmailFlow(String(row.id))),
    );
  }

  async updateEmailFlows<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    const sanitized = rows.map(
      ({ graph_document: _graphDocument, _publish: _publish, ...row }) => row,
    );
    await updateRows(
      this.db,
      tableConfigs.emailFlows.table,
      Array.isArray(input) ? sanitized : sanitized[0],
    );
    for (const row of rows) {
      await this.snapshotEmailFlowVersion(String(row.id), {
        graphDocument: row.graph_document,
        publish: row._publish === true,
      });
    }
    if (Array.isArray(input)) {
      return (await Promise.all(
        rows.map((row) => this.retrieveEmailFlow(String(row.id))),
      )) as UpdateRowsResult<T>;
    }
    return (await this.retrieveEmailFlow(
      String(rows[0].id),
    )) as UpdateRowsResult<T>;
  }

  deleteEmailFlows(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailFlows.table, ids);
  }

  async getStandardFlowRecipeCatalogue() {
    const [flows, templates] = await Promise.all([
      this.listEmailFlows(),
      this.listEmailTemplates(),
    ]);
    const flowIds = new Set(flows.map((flow) => String(flow.id)));
    const templateIds = new Set(
      templates.map((template) => String(template.id)),
    );

    return selectStandardFlowRecipes().map((recipe) => ({
      description: recipe.description,
      flow_id: recipe.flowId,
      flow_installed: flowIds.has(recipe.flowId),
      key: recipe.key,
      message_kind: recipe.messageKind,
      name: recipe.name,
      template_id: recipe.templates[0]?.id,
      template_ids: recipe.templates.map((template) => template.id),
      template_installed: recipe.templates.every((template) =>
        templateIds.has(template.id),
      ),
      trigger_event: recipe.triggerEvent,
    }));
  }

  async installStandardFlowDrafts(recipeKeys?: readonly string[]) {
    const recipes = selectStandardFlowRecipes(recipeKeys);
    const [flows, templates] = await Promise.all([
      this.listEmailFlows(),
      this.listEmailTemplates(),
    ]);
    const flowIds = new Set(flows.map((flow) => String(flow.id)));
    const flowsById = new Map(flows.map((flow) => [String(flow.id), flow]));
    const templateIds = new Set(
      templates.map((template) => String(template.id)),
    );
    const createdFlowIds: string[] = [];
    const createdTemplateIds: string[] = [];
    const existingFlowIds: string[] = [];
    const existingTemplateIds: string[] = [];
    const retiredFlowIds: string[] = [];
    const updatedFlowIds: string[] = [];

    if (recipes.some((recipe) => recipe.key === "post-delivery-follow-up")) {
      for (const legacyFlowId of [
        "flow_post_purchase_3_days_v1",
        "flow_post_purchase_7_days_v1",
        "flow_medusa_post_purchase_3_days_v2",
        "flow_medusa_post_purchase_7_days_v2",
      ]) {
        const legacyFlow = flowsById.get(legacyFlowId);
        if (legacyFlow?.status !== "draft") continue;
        await this.deleteEmailFlows(legacyFlowId);
        flowIds.delete(legacyFlowId);
        retiredFlowIds.push(legacyFlowId);
      }
    }
    if (recipes.some((recipe) => recipe.key === "win-back-30-days")) {
      const legacyWinBack = flowsById.get("flow_win_back_30_days_v1");
      if (legacyWinBack?.status === "draft") {
        await this.deleteEmailFlows("flow_win_back_30_days_v1");
        flowIds.delete("flow_win_back_30_days_v1");
        retiredFlowIds.push("flow_win_back_30_days_v1");
      }
    }

    for (const recipe of recipes) {
      for (const template of recipe.templates) {
        if (templateIds.has(template.id)) {
          existingTemplateIds.push(template.id);
          continue;
        }
        await this.createEmailTemplates([
          {
            category: template.category,
            html_content: template.htmlContent,
            id: template.id,
            is_active: false,
            name: template.name,
            preview_text: template.previewText,
            subject: template.subject,
            text_content: template.textContent,
            variables: template.variables,
          },
        ]);
        templateIds.add(template.id);
        createdTemplateIds.push(template.id);
      }

      if (flowIds.has(recipe.flowId)) {
        existingFlowIds.push(recipe.flowId);
        const existing = flowsById.get(recipe.flowId);
        if (existing?.status === "draft") {
          const safeSteps = applyStandardEmailStepSafety(
            existing.steps,
            recipe.steps,
          );
          const reentryDuration =
            recipe.reentry.mode === "after_duration"
              ? recipe.reentry.duration
              : null;
          const reentryUnit =
            recipe.reentry.mode === "after_duration"
              ? recipe.reentry.unit
              : null;
          const policyChanged =
            existing.message_kind !== recipe.messageKind ||
            existing.trigger_event !== recipe.triggerEvent ||
            existing.reentry_mode !== recipe.reentry.mode ||
            Number(existing.reentry_duration ?? 0) !==
              Number(reentryDuration ?? 0) ||
            (existing.reentry_unit ?? null) !== reentryUnit;
          if (safeSteps.changed || policyChanged) {
            await this.updateEmailFlows({
              id: recipe.flowId,
              message_kind: recipe.messageKind,
              reentry_duration: reentryDuration,
              reentry_mode: recipe.reentry.mode,
              reentry_unit: reentryUnit,
              steps: safeSteps.steps,
              trigger_event: recipe.triggerEvent,
            });
            updatedFlowIds.push(recipe.flowId);
          }
        }
        continue;
      }

      await this.createEmailFlows([
        {
          description: recipe.description,
          id: recipe.flowId,
          message_kind: recipe.messageKind,
          name: recipe.name,
          reentry_duration:
            recipe.reentry.mode === "after_duration"
              ? recipe.reentry.duration
              : null,
          reentry_mode: recipe.reentry.mode,
          reentry_unit:
            recipe.reentry.mode === "after_duration"
              ? recipe.reentry.unit
              : null,
          status: "draft",
          steps: recipe.steps,
          tags: recipe.tags,
          trigger_conditions: [],
          trigger_delay_hours: 0,
          trigger_event: recipe.triggerEvent,
        },
      ]);
      flowIds.add(recipe.flowId);
      createdFlowIds.push(recipe.flowId);
    }

    return {
      created_flow_ids: createdFlowIds,
      created_template_ids: createdTemplateIds,
      existing_flow_ids: existingFlowIds,
      existing_template_ids: existingTemplateIds,
      retired_flow_ids: retiredFlowIds,
      updated_flow_ids: updatedFlowIds,
    };
  }

  listEmailFlowRuns(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailFlowRuns.table, filter);
  }

  retrieveEmailFlowRun(id: string) {
    return retrieveRow(this.db, tableConfigs.emailFlowRuns.table, id);
  }

  createEmailFlowRuns(rows: AnyRecord[]) {
    return createRows(
      this.db,
      tableConfigs.emailFlowRuns.table,
      rows,
      tableConfigs.emailFlowRuns.prefix,
    );
  }

  async createFlowRunSnapshot(input: {
    context: AnyRecord;
    flowId: string;
    flowVersionId?: string | null;
    sourceEventId?: string;
    stepsSnapshot: unknown[];
    subscriberEmail: string;
  }) {
    const id = createId("emrun");
    const normalizedEmail = normalizeEmail(input.subscriberEmail);
    const inserted = await this.db
      .insert(emailFlowRuns)
      .values({
        context: input.context,
        currentStepIndex: 0,
        flowId: input.flowId,
        flowVersionId: input.flowVersionId ?? null,
        id,
        sourceEventId: input.sourceEventId ?? null,
        startedAt: new Date(),
        status: "running",
        stepsSnapshot: input.stepsSnapshot,
        subscriberEmail: normalizedEmail,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted[0]) {
      return { created: true, run: toPublicRecord(inserted[0] as AnyRecord) };
    }

    if (!input.sourceEventId) {
      throw new Error("Could not create flow run");
    }

    const [existing] = await this.db
      .select()
      .from(emailFlowRuns)
      .where(
        and(
          eq(emailFlowRuns.flowId, input.flowId),
          eq(emailFlowRuns.subscriberEmail, normalizedEmail),
          eq(emailFlowRuns.sourceEventId, input.sourceEventId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Could not retrieve duplicate flow run");
    }

    return { created: false, run: toPublicRecord(existing as AnyRecord) };
  }

  updateEmailFlowRuns<T extends RowInput>(input: T) {
    return updateRows(this.db, tableConfigs.emailFlowRuns.table, input);
  }

  deleteEmailFlowRuns(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailFlowRuns.table, ids);
  }

  listEmailSubscribers(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailSubscribers.table, filter);
  }

  retrieveEmailSubscriber(id: string) {
    return retrieveRow(this.db, tableConfigs.emailSubscribers.table, id);
  }

  async createEmailSubscribers(rows: AnyRecord[]) {
    const sanitized = rows.map(({ _consent_source: _source, ...row }) => row);
    const created = await createRows(
      this.db,
      tableConfigs.emailSubscribers.table,
      sanitized,
      tableConfigs.emailSubscribers.prefix,
    );
    for (let index = 0; index < created.length; index++) {
      const subscriber = created[index];
      await this.recordConsentEvent({
        action: subscriber.subscribed === false ? "unsubscribed" : "subscribed",
        email: String(subscriber.email),
        source:
          typeof rows[index]?._consent_source === "string"
            ? String(rows[index]?._consent_source)
            : typeof subscriber.subscription_source === "string"
              ? subscriber.subscription_source
              : "admin",
      });
    }
    return created;
  }

  async updateEmailSubscribers<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    const before = await Promise.all(
      rows.map((row) => this.retrieveEmailSubscriber(String(row.id))),
    );
    const sanitized = rows.map(({ _consent_source: _source, ...row }) => row);
    await updateRows(
      this.db,
      tableConfigs.emailSubscribers.table,
      Array.isArray(input) ? sanitized : sanitized[0],
    );
    const after = await Promise.all(
      rows.map((row) => this.retrieveEmailSubscriber(String(row.id))),
    );
    for (let index = 0; index < rows.length; index++) {
      if (before[index].subscribed !== after[index].subscribed) {
        await this.recordConsentEvent({
          action:
            after[index].subscribed === true ? "subscribed" : "unsubscribed",
          email: String(after[index].email),
          source:
            typeof rows[index]._consent_source === "string"
              ? String(rows[index]._consent_source)
              : "admin",
        });
      }
    }
    return (Array.isArray(input) ? after : after[0]) as UpdateRowsResult<T>;
  }

  async deleteEmailSubscribers(ids: string | string[]) {
    const normalizedIds = Array.isArray(ids) ? ids : [ids];
    if (normalizedIds.length === 0) return;

    await this.db.transaction(async (transaction) => {
      const db = transaction as unknown as EilishMessagingDb;
      const subscribers = await db
        .select({ email: emailSubscribers.email })
        .from(emailSubscribers)
        .where(
          and(
            inArray(emailSubscribers.id, normalizedIds),
            isNull(emailSubscribers.deletedAt),
          ),
        );
      const emails = [
        ...new Set(subscribers.map(({ email }) => normalizeEmail(email))),
      ];
      const deletedAt = new Date();

      await db
        .update(emailSubscribers)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            inArray(emailSubscribers.id, normalizedIds),
            isNull(emailSubscribers.deletedAt),
          ),
        );

      if (emails.length > 0) {
        await db
          .update(emailFlowRuns)
          .set({ deletedAt, updatedAt: deletedAt })
          .where(
            and(
              inArray(emailFlowRuns.subscriberEmail, emails),
              isNull(emailFlowRuns.deletedAt),
            ),
          );
      }
    });
  }

  listEmailSegments(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailSegments.table, filter);
  }

  retrieveEmailSegment(id: string) {
    return retrieveRow(this.db, tableConfigs.emailSegments.table, id);
  }

  async createEmailSegments(rows: AnyRecord[]) {
    const created = await createRows(
      this.db,
      tableConfigs.emailSegments.table,
      rows,
      tableConfigs.emailSegments.prefix,
    );
    for (const segment of created) {
      await this.refreshEmailSegmentMembers(String(segment.id));
    }
    return Promise.all(
      created.map((segment) => this.retrieveEmailSegment(String(segment.id))),
    );
  }

  async updateEmailSegments<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    await updateRows(this.db, tableConfigs.emailSegments.table, input);
    for (const segment of rows) {
      await this.refreshEmailSegmentMembers(String(segment.id));
    }
    if (Array.isArray(input)) {
      return (await Promise.all(
        rows.map((segment) => this.retrieveEmailSegment(String(segment.id))),
      )) as UpdateRowsResult<T>;
    }
    return (await this.retrieveEmailSegment(
      String(rows[0].id),
    )) as UpdateRowsResult<T>;
  }

  deleteEmailSegments(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailSegments.table, ids);
  }

  async previewEmailSegment(rules: SegmentRuleGroup) {
    const subscribers = await this.listEmailSubscribers({ subscribed: true });
    const matches = subscribers.filter((subscriber) =>
      evaluateSegmentRules(rules, profileForSegment(subscriber)),
    );
    return {
      count: matches.length,
      sample: matches.slice(0, 10).map((subscriber) => ({
        email: subscriber.email,
        first_name: subscriber.first_name,
        id: subscriber.id,
        last_name: subscriber.last_name,
      })),
    };
  }

  async refreshEmailSegmentMembers(segmentId: string) {
    const segment = await this.retrieveEmailSegment(segmentId);
    const preview = await this.previewEmailSegment(
      segment.rules as SegmentRuleGroup,
    );
    const subscribers = await this.listEmailSubscribers({ subscribed: true });
    const matches = subscribers.filter((subscriber) =>
      evaluateSegmentRules(
        segment.rules as SegmentRuleGroup,
        profileForSegment(subscriber),
      ),
    );
    const evaluatedAt = new Date();
    await this.db.transaction(async (tx) => {
      await tx
        .delete(emailSegmentMembers)
        .where(eq(emailSegmentMembers.segmentId, segmentId));
      if (matches.length > 0) {
        await tx.insert(emailSegmentMembers).values(
          matches.map((subscriber) => ({
            email: normalizeEmail(String(subscriber.email)),
            matchedAt: evaluatedAt,
            segmentId,
            subscriberId: String(subscriber.id),
          })),
        );
      }
      await tx
        .update(emailSegments)
        .set({
          estimatedCount: preview.count,
          lastEvaluatedAt: evaluatedAt,
          updatedAt: evaluatedAt,
        })
        .where(eq(emailSegments.id, segmentId));
    });
    return preview;
  }

  async recordConsentEvent(input: {
    action: "subscribed" | "unsubscribed";
    email: string;
    metadata?: AnyRecord | null;
    occurredAt?: Date;
    source: string;
    topic?: string;
  }) {
    const [event] = await this.db
      .insert(emailConsentEvents)
      .values({
        action: input.action,
        email: normalizeEmail(input.email),
        metadata: input.metadata ?? null,
        occurredAt: input.occurredAt ?? new Date(),
        source: input.source,
        topic: input.topic ?? "marketing",
      })
      .returning();
    return toPublicRecord(event as AnyRecord);
  }

  async listConsentEvents(email: string) {
    const rows = await this.db
      .select()
      .from(emailConsentEvents)
      .where(eq(emailConsentEvents.email, normalizeEmail(email)))
      .orderBy(desc(emailConsentEvents.occurredAt));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async getSubscriberTimeline(subscriberId: string) {
    const subscriber = await this.retrieveEmailSubscriber(subscriberId);
    const email = normalizeEmail(String(subscriber.email));
    const [events, flowRuns, suppressions, consent] = await Promise.all([
      this.listEmailEvents({ subscriber_email: email }),
      this.listEmailFlowRuns({ subscriber_email: email }),
      this.listMessageSuppressions({ email }),
      this.listConsentEvents(email),
    ]);
    const timeline = [
      ...events.map((event) => ({
        at: event.created_at,
        data: event,
        kind: "email_event",
      })),
      ...flowRuns.map((run) => ({
        at: run.started_at,
        data: run,
        kind: "flow_run",
      })),
      ...suppressions.map((suppression) => ({
        at: suppression.created_at,
        data: suppression,
        kind: "suppression",
      })),
      ...consent.map((entry) => ({
        at: entry.occurred_at,
        data: entry,
        kind: "consent",
      })),
    ].sort((left, right) => String(right.at).localeCompare(String(left.at)));
    return { subscriber, timeline };
  }

  listEmailEvents(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailEvents.table, filter);
  }

  async findCommerceEventSince(input: {
    email: string;
    eventTypes: string[];
    orderId?: string;
    since: Date;
  }) {
    if (input.eventTypes.length === 0) {
      return null;
    }

    const normalizedEmail = normalizeEmail(input.email);
    const [event] = await this.db
      .select()
      .from(commerceEvents)
      .where(
        and(
          inArray(commerceEvents.eventType, input.eventTypes),
          gte(commerceEvents.receivedAt, input.since),
          or(
            sql`lower(coalesce(${commerceEvents.payload}->'context'->>'email', '')) = ${normalizedEmail}`,
            sql`lower(coalesce(${commerceEvents.payload}->'payload'->>'email', '')) = ${normalizedEmail}`,
          ),
          ...(input.orderId
            ? [
                or(
                  sql`coalesce(${commerceEvents.payload}->'context'->>'order_id', '') = ${input.orderId}`,
                  sql`coalesce(${commerceEvents.payload}->'payload'->>'order_id', '') = ${input.orderId}`,
                ),
              ]
            : []),
        ),
      )
      .orderBy(desc(commerceEvents.receivedAt))
      .limit(1);

    return event ? toPublicRecord(event as AnyRecord) : null;
  }

  async claimMarketingSendWindow(input: {
    email: string;
    hours: number;
    now?: Date;
    source: string;
  }) {
    const normalizedEmail = normalizeEmail(input.email);
    const now = input.now ?? new Date();
    const hours = Math.max(1, Math.floor(input.hours));
    const threshold = new Date(now.getTime() - hours * 60 * 60 * 1000);
    const [claimed] = await this.db
      .insert(emailMarketingSendStates)
      .values({
        email: normalizedEmail,
        lastAttemptAt: now,
        lastSource: input.source,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          lastAttemptAt: now,
          lastSource: input.source,
          updatedAt: now,
        },
        setWhere: lte(emailMarketingSendStates.lastAttemptAt, threshold),
        target: emailMarketingSendStates.email,
      })
      .returning();

    if (claimed) {
      return {
        allowed: true as const,
        lastAttemptAt: now,
      };
    }

    const [existing] = await this.db
      .select()
      .from(emailMarketingSendStates)
      .where(eq(emailMarketingSendStates.email, normalizedEmail))
      .limit(1);
    return {
      allowed: false as const,
      lastAttemptAt: existing?.lastAttemptAt ?? null,
      reason: `Marketing email attempted within the last ${hours} hours`,
    };
  }

  async recordMarketingSendAttempt(input: {
    email: string;
    now?: Date;
    source: string;
  }) {
    const normalizedEmail = normalizeEmail(input.email);
    const now = input.now ?? new Date();
    const [state] = await this.db
      .insert(emailMarketingSendStates)
      .values({
        email: normalizedEmail,
        lastAttemptAt: now,
        lastSource: input.source,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        set: {
          lastAttemptAt: now,
          lastSource: input.source,
          updatedAt: now,
        },
        target: emailMarketingSendStates.email,
      })
      .returning();
    return toPublicRecord(state as AnyRecord);
  }

  retrieveEmailEvent(id: string) {
    return retrieveRow(this.db, tableConfigs.emailEvents.table, id);
  }

  createEmailEvents(rows: AnyRecord[]) {
    return createRows(
      this.db,
      tableConfigs.emailEvents.table,
      rows,
      tableConfigs.emailEvents.prefix,
    );
  }

  updateEmailEvents<T extends RowInput>(input: T) {
    return updateRows(this.db, tableConfigs.emailEvents.table, input);
  }

  deleteEmailEvents(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailEvents.table, ids);
  }

  listEmailCampaigns(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailCampaigns.table, filter);
  }

  async listDueScheduledEmailCampaigns(now = new Date(), limit = 100) {
    const rows = await this.db
      .select()
      .from(emailCampaigns)
      .where(
        and(
          eq(emailCampaigns.status, "scheduled"),
          lte(emailCampaigns.scheduledAt, now),
          isNull(emailCampaigns.deletedAt),
        ),
      )
      .orderBy(emailCampaigns.scheduledAt)
      .limit(limit);
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  retrieveEmailCampaign(id: string) {
    return retrieveRow(this.db, tableConfigs.emailCampaigns.table, id);
  }

  async listEmailCampaignRevisions(campaignId: string) {
    const rows = await this.db
      .select()
      .from(emailCampaignRevisions)
      .where(eq(emailCampaignRevisions.campaignId, campaignId))
      .orderBy(desc(emailCampaignRevisions.version));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async retrieveEmailCampaignRevision(id: string) {
    const [row] = await this.db
      .select()
      .from(emailCampaignRevisions)
      .where(eq(emailCampaignRevisions.id, id))
      .limit(1);
    if (!row) {
      throw new Error(`Campaign revision not found: ${id}`);
    }
    return toPublicRecord(row as AnyRecord);
  }

  private async snapshotEmailCampaignRevision(
    campaignId: string,
    options: {
      createdBy?: string | null;
      frozen?: boolean;
      reuseFrozen?: boolean;
    } = {},
  ) {
    return this.withVersionLock(`campaign:${campaignId}`, async (db) => {
      const campaign = await retrieveRow(db, emailCampaigns, campaignId);
      if (
        options.reuseFrozen &&
        typeof campaign.send_revision_id === "string" &&
        campaign.send_revision_id
      ) {
        return retrieveRow(
          db,
          emailCampaignRevisions,
          campaign.send_revision_id,
        );
      }
      const template = await retrieveRow(
        db,
        emailTemplates,
        String(campaign.template_id),
      );
      const templateVersionId =
        typeof template.published_version_id === "string"
          ? template.published_version_id
          : null;
      if (!templateVersionId) {
        throw new Error(
          `Template ${String(template.id)} must be published before it can be used by a campaign`,
        );
      }
      const [latest] = await db
        .select({
          version: sql<number>`coalesce(max(${emailCampaignRevisions.version}), 0)::int`,
        })
        .from(emailCampaignRevisions)
        .where(eq(emailCampaignRevisions.campaignId, campaignId));
      const id = createId("emcr");
      const [revision] = await db
        .insert(emailCampaignRevisions)
        .values({
          audienceDefinition: campaign.subscriber_filter ?? null,
          campaignId,
          context: campaign.context ?? null,
          createdBy: options.createdBy ?? null,
          frozenAt: options.frozen ? new Date() : null,
          id,
          scheduledAt:
            campaign.scheduled_at instanceof Date
              ? campaign.scheduled_at
              : typeof campaign.scheduled_at === "string"
                ? new Date(campaign.scheduled_at)
                : null,
          subject: String(campaign.subject),
          templateId: String(template.id),
          templateVersionId,
          version: Number(latest?.version ?? 0) + 1,
        })
        .returning();
      await db
        .update(emailCampaigns)
        .set({
          draftRevisionId: id,
          ...(options.frozen ? { sendRevisionId: id } : {}),
          updatedAt: new Date(),
        })
        .where(eq(emailCampaigns.id, campaignId));
      return toPublicRecord(revision as AnyRecord);
    });
  }

  async ensureCampaignSendRevision(campaignId: string) {
    return this.snapshotEmailCampaignRevision(campaignId, {
      frozen: true,
      reuseFrozen: true,
    });
  }

  async resolveCampaignRevisionTemplate(revisionId: string) {
    const revision = await this.retrieveEmailCampaignRevision(revisionId);
    return this.resolveEmailTemplateForDelivery(
      String(revision.template_id),
      String(revision.template_version_id),
    );
  }

  async createEmailCampaigns(rows: AnyRecord[]) {
    const created = await createRows(
      this.db,
      tableConfigs.emailCampaigns.table,
      rows,
      tableConfigs.emailCampaigns.prefix,
    );
    for (const row of created) {
      await this.snapshotEmailCampaignRevision(String(row.id));
    }
    return Promise.all(
      created.map((row) => this.retrieveEmailCampaign(String(row.id))),
    );
  }

  async updateEmailCampaigns<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    await updateRows(this.db, tableConfigs.emailCampaigns.table, input);
    for (const row of rows) {
      const changedContent =
        "subject" in row ||
        "template_id" in row ||
        "templateId" in row ||
        "subscriber_filter" in row ||
        "subscriberFilter" in row ||
        "context" in row ||
        "scheduled_at" in row ||
        "scheduledAt" in row;
      if (changedContent) {
        await this.snapshotEmailCampaignRevision(String(row.id));
      }
    }
    if (Array.isArray(input)) {
      return (await Promise.all(
        rows.map((row) => this.retrieveEmailCampaign(String(row.id))),
      )) as UpdateRowsResult<T>;
    }
    return (await this.retrieveEmailCampaign(
      String(rows[0].id),
    )) as UpdateRowsResult<T>;
  }

  deleteEmailCampaigns(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailCampaigns.table, ids);
  }

  listEmailProductWatches(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailProductWatches.table, filter);
  }

  retrieveEmailProductWatch(id: string) {
    return retrieveRow(this.db, tableConfigs.emailProductWatches.table, id);
  }

  createEmailProductWatches(rows: AnyRecord[]) {
    return createRows(
      this.db,
      tableConfigs.emailProductWatches.table,
      rows,
      tableConfigs.emailProductWatches.prefix,
    );
  }

  async ensureCartPriceDropWatches(input: {
    email: string;
    items: Array<{
      context: AnyRecord;
      currencyCode?: string;
      productId: string;
      referencePrice: number;
      variantId?: string;
    }>;
  }) {
    if (input.items.length === 0) return [];
    const now = new Date();
    const inserted = await this.db
      .insert(emailProductWatches)
      .values(
        input.items.map((item) => ({
          alertType: "cart-price-drop" as const,
          context: item.context,
          createdAt: now,
          currencyCode: item.currencyCode,
          email: normalizeEmail(input.email),
          id: createId("emwatch"),
          productId: item.productId,
          referencePrice: item.referencePrice,
          updatedAt: now,
          variantId: item.variantId,
        })),
      )
      .onConflictDoNothing()
      .returning();
    return inserted.map((row) => toPublicRecord(row as AnyRecord));
  }

  async completeCartPriceDropWatches(email: string) {
    return this.db
      .update(emailProductWatches)
      .set({ notified: true, notifiedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(emailProductWatches.alertType, "cart-price-drop"),
          eq(emailProductWatches.email, normalizeEmail(email)),
          eq(emailProductWatches.notified, false),
          isNull(emailProductWatches.deletedAt),
        ),
      )
      .returning();
  }

  updateEmailProductWatches<T extends RowInput>(input: T) {
    return updateRows(this.db, tableConfigs.emailProductWatches.table, input);
  }

  deleteEmailProductWatches(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailProductWatches.table, ids);
  }

  listEmailDiscountCodes(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.emailDiscountCodes.table, filter);
  }

  retrieveEmailDiscountCode(id: string) {
    return retrieveRow(this.db, tableConfigs.emailDiscountCodes.table, id);
  }

  createEmailDiscountCodes(rows: AnyRecord[]) {
    return createRows(
      this.db,
      tableConfigs.emailDiscountCodes.table,
      rows,
      tableConfigs.emailDiscountCodes.prefix,
    );
  }

  updateEmailDiscountCodes<T extends RowInput>(input: T) {
    return updateRows(this.db, tableConfigs.emailDiscountCodes.table, input);
  }

  deleteEmailDiscountCodes(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.emailDiscountCodes.table, ids);
  }

  listSignupForms(filter: AnyRecord = {}) {
    return listRows(this.db, tableConfigs.signupForms.table, filter);
  }

  retrieveSignupForm(id: string) {
    return retrieveRow(this.db, tableConfigs.signupForms.table, id);
  }

  async listSignupFormVersions(formId: string) {
    const rows = await this.db
      .select()
      .from(signupFormVersions)
      .where(eq(signupFormVersions.formId, formId))
      .orderBy(desc(signupFormVersions.version));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async retrieveSignupFormVersion(id: string) {
    const [row] = await this.db
      .select()
      .from(signupFormVersions)
      .where(eq(signupFormVersions.id, id))
      .limit(1);
    if (!row) {
      throw new Error(`Signup form version not found: ${id}`);
    }
    return toPublicRecord(row as AnyRecord);
  }

  async deleteSignupFormVersion(formId: string, versionId: string) {
    const form = await this.retrieveSignupForm(formId);
    if (
      form.published_version_id === versionId ||
      form.draft_version_id === versionId
    ) {
      throw new Error("The current published form snapshot cannot be deleted");
    }
    const deleted = await this.db
      .delete(signupFormVersions)
      .where(
        and(
          eq(signupFormVersions.formId, formId),
          eq(signupFormVersions.id, versionId),
        ),
      )
      .returning({ id: signupFormVersions.id });
    return { deleted: deleted.length > 0, id: versionId };
  }

  async publishSignupFormVersion(formId: string, versionId?: string) {
    const form = await this.retrieveSignupForm(formId);
    const previousPublishedId =
      typeof form.published_version_id === "string"
        ? form.published_version_id
        : null;
    const targetId =
      versionId ?? String((await this.snapshotSignupFormVersion(formId)).id);
    const version = await this.retrieveSignupFormVersion(targetId);
    const versionFormId =
      typeof version.form_id === "string"
        ? version.form_id
        : typeof version.formId === "string"
          ? version.formId
          : null;
    if (versionFormId !== formId) {
      throw new Error(
        `Signup form version ${targetId} does not belong to ${formId}`,
      );
    }
    const publishedAt = new Date();
    await this.db
      .update(signupFormVersions)
      .set({ publishedAt })
      .where(eq(signupFormVersions.id, targetId));
    await this.db
      .update(signupForms)
      .set({
        document: version.document,
        draftVersionId: targetId,
        publishedAt,
        publishedVersionId: targetId,
        status: "published",
        updatedAt: publishedAt,
      })
      .where(eq(signupForms.id, formId));
    if (previousPublishedId && previousPublishedId !== targetId) {
      await this.db
        .delete(signupFormVersions)
        .where(
          and(
            eq(signupFormVersions.formId, formId),
            eq(signupFormVersions.id, previousPublishedId),
          ),
        );
    }
    return this.retrieveSignupFormVersion(targetId);
  }

  createSignupFormVersion(
    formId: string,
    createdBy?: string | null,
    document?: AnyRecord,
  ) {
    return this.snapshotSignupFormVersion(formId, { createdBy, document });
  }

  private async snapshotSignupFormVersion(
    formId: string,
    options: { createdBy?: string | null; document?: AnyRecord } = {},
  ) {
    return this.withVersionLock(`form:${formId}`, async (db) => {
      const form = await retrieveRow(db, signupForms, formId);
      const [latest] = await db
        .select({
          version: sql<number>`coalesce(max(${signupFormVersions.version}), 0)::int`,
        })
        .from(signupFormVersions)
        .where(eq(signupFormVersions.formId, formId));
      const id = createId("formv");
      const document = options.document ?? (form.document as AnyRecord);
      const [version] = await db
        .insert(signupFormVersions)
        .values({
          createdBy: options.createdBy ?? null,
          document,
          formId,
          id,
          publishedAt: null,
          schemaVersion:
            typeof document?.schema_version === "number"
              ? document.schema_version
              : 1,
          version: Number(latest?.version ?? 0) + 1,
        })
        .returning();
      return toPublicRecord(version as AnyRecord);
    });
  }

  async createSignupForms(rows: AnyRecord[]) {
    const created = await createRows(
      this.db,
      tableConfigs.signupForms.table,
      rows,
      tableConfigs.signupForms.prefix,
    );
    for (const row of created) {
      if (row.status === "published") {
        await this.publishSignupFormVersion(String(row.id));
      }
    }
    return Promise.all(
      created.map((row) => this.retrieveSignupForm(String(row.id))),
    );
  }

  async updateSignupForms<T extends RowInput>(
    input: T,
  ): Promise<UpdateRowsResult<T>> {
    const rows = Array.isArray(input) ? input : [input];
    const sanitized = rows.map(
      ({ _publish: _publish, _created_by: _createdBy, ...row }) => ({
        ...row,
        draft_version_id: null,
      }),
    );
    await updateRows(
      this.db,
      tableConfigs.signupForms.table,
      Array.isArray(input) ? sanitized : sanitized[0],
    );
    for (const row of rows) {
      if (row._publish === true) {
        await this.publishSignupFormVersion(String(row.id));
      }
    }
    if (Array.isArray(input)) {
      return (await Promise.all(
        rows.map((row) => this.retrieveSignupForm(String(row.id))),
      )) as UpdateRowsResult<T>;
    }
    return (await this.retrieveSignupForm(
      String(rows[0].id),
    )) as UpdateRowsResult<T>;
  }

  deleteSignupForms(ids: string | string[]) {
    return deleteRows(this.db, tableConfigs.signupForms.table, ids);
  }

  // The single published form of a given type that the storefront should render.
  // Most-recently published wins if more than one is somehow live.
  async getActiveSignupForm(type: SignupFormType = "popup") {
    const rows = await listRows(this.db, tableConfigs.signupForms.table, {
      type,
      status: "published",
    });
    return this.publishedSignupForm(this.latestPublishedSignupForm(rows));
  }

  // Popup and flyout share the global storefront overlay slot. Only one can be
  // active at a time, so the most recently published supported overlay wins.
  async getActiveOverlaySignupForm() {
    const rows = await listRows(this.db, tableConfigs.signupForms.table, {
      status: "published",
      type: ["popup", "flyout"],
    });
    return this.publishedSignupForm(this.latestPublishedSignupForm(rows));
  }

  private latestPublishedSignupForm(rows: AnyRecord[]) {
    const sorted = [...rows].sort((left, right) => {
      const publishedAt = (row: AnyRecord) => {
        const value = row.published_at;
        const timestamp =
          value instanceof Date
            ? value.getTime()
            : typeof value === "string"
              ? new Date(value).getTime()
              : 0;
        return Number.isFinite(timestamp) ? timestamp : 0;
      };
      return publishedAt(right) - publishedAt(left);
    });
    return sorted[0] ?? null;
  }

  private async publishedSignupForm(form: AnyRecord | null) {
    if (!form || typeof form.published_version_id !== "string") {
      return form;
    }
    const version = await this.retrieveSignupFormVersion(
      form.published_version_id,
    );
    return { ...form, document: version.document, version_id: version.id };
  }

  async incrementSignupFormCounter(
    id: string,
    field: "submitted" | "impressions",
  ) {
    const column = signupForms[field];
    await this.db
      .update(signupForms)
      .set({ [field]: sql`${column} + 1`, updatedAt: new Date() })
      .where(eq(signupForms.id, id));
  }

  async subscribeWithStatus(
    email: string,
    options: {
      first_name?: string;
      firstName?: string;
      last_name?: string;
      lastName?: string;
      source?: string;
      properties?: SubscriberProperties;
    } = {},
  ) {
    const normalizedEmail = normalizeEmail(email);
    const firstName = options.first_name ?? options.firstName;
    const lastName = options.last_name ?? options.lastName;

    await this.clearSuppression(normalizedEmail, "unsubscribe");
    let subscriber = (
      await this.listEmailSubscribers({
        email: normalizedEmail,
      })
    )[0];

    if (!subscriber) {
      const [inserted] = await this.db
        .insert(emailSubscribers)
        .values({
          email: normalizedEmail,
          firstName: firstName ?? null,
          id: createId("emsub"),
          lastName: lastName ?? null,
          properties: options.properties ?? null,
          subscribed: true,
          subscribedAt: new Date(),
          subscriptionSource: options.source ?? null,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        await this.recordConsentEvent({
          action: "subscribed",
          email: normalizedEmail,
          source: options.source ?? "unknown",
        });
        return {
          subscriber: toPublicRecord(inserted as AnyRecord),
          welcomeEligible: true,
        };
      }

      // Another request inserted the same active email between our read and
      // insert. Continue through the transition path using its row.
      subscriber = (
        await this.listEmailSubscribers({
          email: normalizedEmail,
        })
      )[0];
      if (!subscriber) {
        throw new Error("Could not retrieve concurrently created subscriber");
      }
    }

    const mergedProperties = options.properties
      ? {
          ...(subscriber.properties as AnyRecord | null),
          ...options.properties,
        }
      : undefined;
    const [transitioned] = await this.db
      .update(emailSubscribers)
      .set({
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(mergedProperties ? { properties: mergedProperties } : {}),
        subscribed: true,
        subscribedAt: new Date(),
        subscriptionSource:
          options.source ??
          (typeof subscriber.subscription_source === "string"
            ? subscriber.subscription_source
            : null),
        unsubscribedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailSubscribers.id, String(subscriber.id)),
          eq(emailSubscribers.subscribed, false),
          isNull(emailSubscribers.deletedAt),
        ),
      )
      .returning();
    if (transitioned) {
      await this.recordConsentEvent({
        action: "subscribed",
        email: normalizedEmail,
        source: options.source ?? "resubscribe",
      });
      return {
        subscriber: toPublicRecord(transitioned as AnyRecord),
        welcomeEligible: true,
      };
    }

    // The subscriber was already active, or another concurrent request won the
    // transition. Refresh before merging metadata so we do not reset the
    // winner's subscribed_at timestamp.
    const current =
      (await this.listEmailSubscribers({ email: normalizedEmail }))[0] ??
      subscriber;
    const updated = await this.updateEmailSubscribers({
      id: current.id,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      ...(options.properties
        ? {
            properties: {
              ...(current.properties as AnyRecord | null),
              ...options.properties,
            },
          }
        : {}),
      subscribed: true,
      subscribed_at: current.subscribed_at ?? new Date(),
      subscription_source: options.source ?? current.subscription_source,
      unsubscribed_at: null,
    });

    return {
      subscriber: updated ?? current,
      welcomeEligible: false,
    };
  }

  async subscribe(
    email: string,
    options: {
      first_name?: string;
      firstName?: string;
      last_name?: string;
      lastName?: string;
      source?: string;
      properties?: SubscriberProperties;
    } = {},
  ) {
    return (await this.subscribeWithStatus(email, options)).subscriber;
  }

  async unsubscribe(email: string) {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.listEmailSubscribers({
      email: normalizedEmail,
    });
    await this.recordSuppression(normalizedEmail, "unsubscribe", "preferences");

    if (existing.length === 0) {
      return null;
    }

    const updated = await this.updateEmailSubscribers({
      _consent_source: "preferences",
      id: existing[0].id,
      subscribed: false,
      unsubscribed_at: new Date(),
    });
    return updated;
  }

  async createEmailPreferenceLink(
    email: string,
    purpose: "unsubscribe" | "preferences" = "unsubscribe",
    options: { expiresInSeconds?: number } = {},
  ) {
    const expiresInSeconds =
      options.expiresInSeconds ?? PREFERENCE_LINK_TTL_SECONDS;
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60) {
      throw new Error("Preference link expiry must be at least 60 seconds");
    }

    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    await this.db.insert(emailPreferenceLinks).values({
      email: normalizeEmail(email),
      expiresAt,
      purpose,
      tokenHash: preferenceLinkTokenHash(token),
    });
    return { expiresAt, token };
  }

  async resolveEmailPreferenceLink(
    token: string,
    purpose: "unsubscribe" | "preferences" = "unsubscribe",
  ) {
    if (!PREFERENCE_LINK_TOKEN_PATTERN.test(token)) {
      return null;
    }
    const [link] = await this.db
      .select({
        email: emailPreferenceLinks.email,
        expiresAt: emailPreferenceLinks.expiresAt,
      })
      .from(emailPreferenceLinks)
      .where(
        and(
          eq(emailPreferenceLinks.tokenHash, preferenceLinkTokenHash(token)),
          eq(emailPreferenceLinks.purpose, purpose),
          gt(emailPreferenceLinks.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return link ?? null;
  }

  getActiveFlowsForEvent(triggerEvent: string) {
    return this.listEmailFlows({
      status: "active",
      trigger_event: triggerEvent,
    });
  }

  async logEmailEvent(data: {
    campaign_id?: string | null;
    flow_step_key?: string | null;
    flow_run_id?: string | null;
    event_type:
      | "sent"
      | "delivered"
      | "opened"
      | "clicked"
      | "bounced"
      | "complained"
      | "skipped";
    message_id?: string | null;
    metadata?: AnyRecord | null;
    provider_event_id?: string | null;
    subscriber_email: string;
    template_id?: string | null;
    template_version_id?: string | null;
  }) {
    if (data.provider_event_id) {
      const existing = await this.listEmailEvents({
        provider_event_id: data.provider_event_id,
      });
      if (existing[0]) {
        return existing[0];
      }
    }

    try {
      const [event] = await this.createEmailEvents([
        {
          ...data,
          subscriber_email: normalizeEmail(data.subscriber_email),
        },
      ]);
      return event;
    } catch (error) {
      if (data.provider_event_id) {
        const existing = await this.listEmailEvents({
          provider_event_id: data.provider_event_id,
        });
        if (existing[0]) {
          return existing[0];
        }
      }
      throw error;
    }
  }

  async triggerFlow(
    flowId: string,
    email: string,
    context: AnyRecord,
    messageKind: MessageKind = "marketing",
    sourceEventId?: string,
    startAfter?: Date,
  ) {
    const normalizedEmail = normalizeEmail(email);
    const jobId = await sendJob(
      queueNames.startFlow,
      {
        context: {
          ...context,
          __message_kind: messageKind,
          email: normalizedEmail,
        },
        email: normalizedEmail,
        flowId,
        messageKind,
        sourceEventId,
      },
      startAfter ? { startAfter } : {},
    );

    return { jobId };
  }

  async triggerFlowsForEvent(
    triggerEvent: string,
    email: string,
    context: AnyRecord,
    messageKind: MessageKind = "marketing",
    sourceEventId?: string,
  ): Promise<FlowTriggerResult[]> {
    const flows = await this.getActiveFlowsForEvent(triggerEvent);
    const normalizedEmail = normalizeEmail(email);
    const subscribers = await this.listEmailSubscribers({
      email: normalizedEmail,
    });
    const subscriber = subscribers[0] ?? null;
    const results: FlowTriggerResult[] = [];

    for (const flow of flows) {
      const effectiveMessageKind = resolveFlowMessageKind(
        flow.message_kind,
        messageKind,
      );
      const conditions =
        flow.trigger_conditions as TriggerConditionInput | null;
      if (!evaluateTriggerConditions(conditions, subscriber, context)) {
        results.push({
          flowId: String(flow.id),
          flowName: String(flow.name),
          jobId: undefined,
          reason: "Trigger conditions not met",
          skipped: true,
        });
        continue;
      }

      const canEnter = await this.checkFlowReentry(flow, normalizedEmail);
      if (!canEnter.allowed) {
        results.push({
          flowId: String(flow.id),
          flowName: String(flow.name),
          jobId: undefined,
          reason: canEnter.reason,
          skipped: true,
        });
        continue;
      }

      const result = await this.triggerFlow(
        String(flow.id),
        normalizedEmail,
        {
          ...context,
          __trigger_event: triggerEvent,
        },
        effectiveMessageKind,
        sourceEventId,
        Number(flow.trigger_delay_hours ?? 0) > 0
          ? new Date(
              Date.now() + Number(flow.trigger_delay_hours) * 60 * 60 * 1000,
            )
          : undefined,
      );
      results.push({
        flowId: String(flow.id),
        flowName: String(flow.name),
        ...result,
      });
    }

    return results;
  }

  async cancelFlowRun(flowRunId: string) {
    const run = await this.retrieveEmailFlowRun(flowRunId);
    if (run.status !== "running") {
      throw new Error(
        `Cannot cancel flow run with status: ${String(run.status)}`,
      );
    }

    return this.updateEmailFlowRuns({ id: flowRunId, status: "cancelled" });
  }

  async getFilteredSubscribers(filter: CampaignFilter | null) {
    const allSubscribers = await this.listEmailSubscribers({
      subscribed: true,
    });
    if (!filter || Object.keys(filter).length === 0) {
      return allSubscribers;
    }

    const includeSegmentIds = filter.segment_ids ?? [];
    const excludeSegmentIds = filter.exclude_segment_ids ?? [];
    for (const segmentId of new Set([
      ...includeSegmentIds,
      ...excludeSegmentIds,
    ])) {
      await this.refreshEmailSegmentMembers(segmentId);
    }
    const segmentIds = [...includeSegmentIds, ...excludeSegmentIds];
    const segmentRows =
      segmentIds.length > 0
        ? await this.db
            .select()
            .from(emailSegmentMembers)
            .where(inArray(emailSegmentMembers.segmentId, segmentIds))
        : [];
    const includedSubscribers = new Set(
      segmentRows
        .filter((row) => includeSegmentIds.includes(row.segmentId))
        .map((row) => row.subscriberId),
    );
    const excludedSubscribers = new Set(
      segmentRows
        .filter((row) => excludeSegmentIds.includes(row.segmentId))
        .map((row) => row.subscriberId),
    );

    return allSubscribers.filter((subscriber) => {
      const properties =
        (subscriber.properties as SubscriberProperties | null) ?? {};
      const tags = properties.tags ?? [];

      if (
        filter.tags &&
        filter.tags.length > 0 &&
        !filter.tags.some((tag) => tags.includes(tag))
      ) {
        return false;
      }

      if (
        filter.exclude_tags &&
        filter.exclude_tags.length > 0 &&
        filter.exclude_tags.some((tag) => tags.includes(tag))
      ) {
        return false;
      }

      if (
        includeSegmentIds.length > 0 &&
        !includedSubscribers.has(String(subscriber.id))
      ) {
        return false;
      }
      if (excludedSubscribers.has(String(subscriber.id))) {
        return false;
      }

      return true;
    });
  }

  async previewCampaignAudience(filter: CampaignFilter | null) {
    const subscribers = await this.getFilteredSubscribers(filter);
    return { count: subscribers.length };
  }

  async listDistinctCommerceEventTypes() {
    return this.db
      .select({
        count: sql<number>`count(*)::int`,
        event_type: commerceEvents.eventType,
      })
      .from(commerceEvents)
      .groupBy(commerceEvents.eventType)
      .orderBy(sql`count(*) desc`);
  }

  async getFlowAnalytics(flowId: string) {
    const rows = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        eventType: emailEvents.eventType,
        templateId: emailEvents.templateId,
      })
      .from(emailEvents)
      .innerJoin(emailFlowRuns, eq(emailEvents.flowRunId, emailFlowRuns.id))
      .where(
        and(
          eq(emailFlowRuns.flowId, flowId),
          isNull(emailFlowRuns.deletedAt),
          isNull(emailEvents.deletedAt),
        ),
      )
      .groupBy(emailEvents.templateId, emailEvents.eventType);

    const stepMetrics: Record<
      string,
      {
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        skipped: number;
        open_rate: number;
        click_rate: number;
      }
    > = {};

    for (const row of rows) {
      if (!row.templateId) continue;
      const metrics = stepMetrics[row.templateId] ?? {
        clicked: 0,
        click_rate: 0,
        delivered: 0,
        opened: 0,
        open_rate: 0,
        sent: 0,
        skipped: 0,
      };

      if (
        row.eventType === "sent" ||
        row.eventType === "delivered" ||
        row.eventType === "opened" ||
        row.eventType === "clicked" ||
        row.eventType === "skipped"
      ) {
        metrics[row.eventType] = Number(row.count ?? 0);
      }

      stepMetrics[row.templateId] = metrics;
    }

    for (const metrics of Object.values(stepMetrics)) {
      metrics.open_rate =
        metrics.sent > 0
          ? Math.round((metrics.opened / metrics.sent) * 100)
          : 0;
      metrics.click_rate =
        metrics.sent > 0
          ? Math.round((metrics.clicked / metrics.sent) * 100)
          : 0;
    }

    return { step_metrics: stepMetrics };
  }

  async getCampaignAnalytics(campaignId: string) {
    const rows = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        eventType: emailEvents.eventType,
      })
      .from(emailEvents)
      .where(
        and(
          sql`${emailEvents.metadata}->>'campaign_id' = ${campaignId}`,
          isNull(emailEvents.deletedAt),
        ),
      )
      .groupBy(emailEvents.eventType);

    const analytics = {
      bounced: 0,
      clicked: 0,
      click_rate: 0,
      delivered: 0,
      opened: 0,
      open_rate: 0,
      sent: 0,
    };

    for (const row of rows) {
      if (
        row.eventType === "sent" ||
        row.eventType === "delivered" ||
        row.eventType === "opened" ||
        row.eventType === "clicked"
      ) {
        analytics[row.eventType] = Number(row.count ?? 0);
      } else if (row.eventType === "bounced") {
        analytics.bounced = Number(row.count ?? 0);
      }
    }

    analytics.open_rate =
      analytics.sent > 0
        ? Math.round((analytics.opened / analytics.sent) * 100)
        : 0;
    analytics.click_rate =
      analytics.sent > 0
        ? Math.round((analytics.clicked / analytics.sent) * 100)
        : 0;

    return analytics;
  }

  async getDeliverabilityAnalytics(input: {
    domainLimit?: number;
    from: Date;
    to: Date;
  }) {
    const eventConditions = and(
      inArray(emailEvents.eventType, deliverabilityEventTypes),
      gte(emailEvents.createdAt, input.from),
      lt(emailEvents.createdAt, input.to),
      isNull(emailEvents.deletedAt),
    );
    const consentConditions = and(
      eq(emailConsentEvents.action, "unsubscribed"),
      eq(emailConsentEvents.topic, "marketing"),
      gte(emailConsentEvents.occurredAt, input.from),
      lt(emailConsentEvents.occurredAt, input.to),
    );
    const uniqueMessageCount = sql<number>`
      count(distinct coalesce(${emailEvents.messageId}, ${emailEvents.id}))::int
    `;
    const eventDay = sql<string>`
      to_char(
        date_trunc('day', ${emailEvents.createdAt} at time zone 'UTC'),
        'YYYY-MM-DD'
      )
    `;
    const consentDay = sql<string>`
      to_char(
        date_trunc('day', ${emailConsentEvents.occurredAt} at time zone 'UTC'),
        'YYYY-MM-DD'
      )
    `;
    const eventDomain = sql<string>`
      coalesce(
        nullif(lower(split_part(${emailEvents.subscriberEmail}, '@', 2)), ''),
        'unknown'
      )
    `;
    const consentDomain = sql<string>`
      coalesce(
        nullif(lower(split_part(${emailConsentEvents.email}, '@', 2)), ''),
        'unknown'
      )
    `;
    const provider = sql<string>`
      coalesce(
        nullif(${emailEvents.metadata}->>'provider', ''),
        'resend'
      )
    `;

    const [
      totalEventRows,
      dailyEventRows,
      providerEventRows,
      domainEventRows,
      totalUnsubscribeRows,
      dailyUnsubscribeRows,
      domainUnsubscribeRows,
    ] = await Promise.all([
      this.db
        .select({
          count: uniqueMessageCount,
          eventType: emailEvents.eventType,
        })
        .from(emailEvents)
        .where(eventConditions)
        .groupBy(emailEvents.eventType),
      this.db
        .select({
          count: uniqueMessageCount,
          date: eventDay,
          eventType: emailEvents.eventType,
        })
        .from(emailEvents)
        .where(eventConditions)
        .groupBy(eventDay, emailEvents.eventType),
      this.db
        .select({
          count: uniqueMessageCount,
          eventType: emailEvents.eventType,
          provider,
        })
        .from(emailEvents)
        .where(eventConditions)
        .groupBy(provider, emailEvents.eventType),
      this.db
        .select({
          count: uniqueMessageCount,
          domain: eventDomain,
          eventType: emailEvents.eventType,
        })
        .from(emailEvents)
        .where(eventConditions)
        .groupBy(eventDomain, emailEvents.eventType),
      this.db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailConsentEvents)
        .where(consentConditions),
      this.db
        .select({
          count: sql<number>`count(*)::int`,
          date: consentDay,
        })
        .from(emailConsentEvents)
        .where(consentConditions)
        .groupBy(consentDay),
      this.db
        .select({
          count: sql<number>`count(*)::int`,
          domain: consentDomain,
        })
        .from(emailConsentEvents)
        .where(consentConditions)
        .groupBy(consentDomain),
    ]);

    const totals = emptyDeliverabilityCounts();
    for (const row of totalEventRows) {
      if (!isDeliverabilityEventType(row.eventType)) continue;
      totals[row.eventType] = Number(row.count ?? 0);
    }
    totals.unsubscribed = Number(totalUnsubscribeRows[0]?.count ?? 0);

    const daily = new Map<string, DeliverabilityCounts>();
    for (const row of dailyEventRows) {
      if (!isDeliverabilityEventType(row.eventType)) continue;
      const counts = daily.get(row.date) ?? emptyDeliverabilityCounts();
      counts[row.eventType] = Number(row.count ?? 0);
      daily.set(row.date, counts);
    }
    for (const row of dailyUnsubscribeRows) {
      const counts = daily.get(row.date) ?? emptyDeliverabilityCounts();
      counts.unsubscribed = Number(row.count ?? 0);
      daily.set(row.date, counts);
    }

    const providers = new Map<string, DeliverabilityCounts>();
    for (const row of providerEventRows) {
      if (!isDeliverabilityEventType(row.eventType)) continue;
      const counts = providers.get(row.provider) ?? emptyDeliverabilityCounts();
      counts[row.eventType] = Number(row.count ?? 0);
      providers.set(row.provider, counts);
    }

    const domains = new Map<string, DeliverabilityCounts>();
    for (const row of domainEventRows) {
      if (!isDeliverabilityEventType(row.eventType)) continue;
      const counts = domains.get(row.domain) ?? emptyDeliverabilityCounts();
      counts[row.eventType] = Number(row.count ?? 0);
      domains.set(row.domain, counts);
    }
    for (const row of domainUnsubscribeRows) {
      const counts = domains.get(row.domain) ?? emptyDeliverabilityCounts();
      counts.unsubscribed = Number(row.count ?? 0);
      domains.set(row.domain, counts);
    }

    const domainLimit = Math.min(100, Math.max(1, input.domainLimit ?? 25));
    const activityCount = (counts: DeliverabilityCounts) =>
      deliverabilityEventTypes.reduce(
        (total, eventType) => total + counts[eventType],
        counts.unsubscribed,
      );

    return {
      daily: Array.from(daily, ([date, counts]) => ({
        date,
        ...counts,
      })).sort((left, right) => left.date.localeCompare(right.date)),
      domains: Array.from(domains, ([domain, counts]) => ({
        domain,
        ...withDeliverabilityRates(counts),
      }))
        .sort(
          (left, right) =>
            right.sent - left.sent ||
            activityCount(right) - activityCount(left) ||
            left.domain.localeCompare(right.domain),
        )
        .slice(0, domainLimit),
      providers: Array.from(providers, ([providerName, counts]) => ({
        provider: providerName,
        ...withDeliverabilityRates(counts),
      })).sort(
        (left, right) =>
          right.sent - left.sent || left.provider.localeCompare(right.provider),
      ),
      range: {
        from: input.from.toISOString(),
        time_zone: "UTC",
        to: input.to.toISOString(),
      },
      totals: withDeliverabilityRates(totals),
    };
  }

  async getAllTags() {
    const subscribers = await this.listEmailSubscribers({ subscribed: true });
    const tags = new Set<string>();
    for (const subscriber of subscribers) {
      const properties =
        (subscriber.properties as SubscriberProperties | null) ?? {};
      for (const tag of properties.tags ?? []) {
        tags.add(tag);
      }
    }

    return Array.from(tags).sort();
  }

  async recordSuppression(
    email: string,
    reason: "bounce" | "complaint" | "manual" | "unsubscribe",
    source: string,
  ) {
    const normalizedEmail = normalizeEmail(email);
    const [suppression] = await this.db
      .insert(messageSuppressions)
      .values({
        active: true,
        email: normalizedEmail,
        reason,
        source,
      })
      .onConflictDoUpdate({
        set: {
          active: true,
          source,
        },
        target: [
          messageSuppressions.email,
          messageSuppressions.channel,
          messageSuppressions.reason,
        ],
      })
      .returning();

    return toPublicRecord(suppression as AnyRecord);
  }

  async clearSuppression(
    email: string,
    reason: "bounce" | "complaint" | "manual" | "unsubscribe",
  ) {
    await this.db
      .update(messageSuppressions)
      .set({ active: false })
      .where(
        and(
          eq(messageSuppressions.email, normalizeEmail(email)),
          eq(messageSuppressions.reason, reason),
          eq(messageSuppressions.active, true),
        ),
      );
  }

  async listMessageSuppressions(filter: AnyRecord = {}) {
    const normalized = normalizeRecord(filter);
    const conditions: DynamicColumn[] = [];

    if (normalized.active !== undefined) {
      const active = normalized.active === true || normalized.active === "true";
      conditions.push(eq(messageSuppressions.active, active));
    }

    if (typeof normalized.email === "string" && normalized.email) {
      conditions.push(
        eq(messageSuppressions.email, normalizeEmail(normalized.email)),
      );
    }

    if (typeof normalized.reason === "string" && normalized.reason) {
      conditions.push(
        eq(
          messageSuppressions.reason,
          normalized.reason as
            "bounce" | "complaint" | "manual" | "unsubscribe",
        ),
      );
    }

    let query = this.db.select().from(messageSuppressions).$dynamic();
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return (
      (await query.orderBy(desc(messageSuppressions.createdAt))) as AnyRecord[]
    ).map((row) => toPublicRecord(row));
  }

  async clearSuppressionById(id: string) {
    const [suppression] = await this.db
      .update(messageSuppressions)
      .set({ active: false })
      .where(eq(messageSuppressions.id, id))
      .returning();

    return suppression ? toPublicRecord(suppression as AnyRecord) : null;
  }

  async getSuppressionState(email: string, messageKind: MessageKind) {
    const normalizedEmail = normalizeEmail(email);
    const activeSuppressions = await this.db
      .select()
      .from(messageSuppressions)
      .where(
        and(
          eq(messageSuppressions.email, normalizedEmail),
          eq(messageSuppressions.active, true),
        ),
      );
    const subscriber = (
      await this.listEmailSubscribers({ email: normalizedEmail })
    )[0];
    const properties =
      (subscriber?.properties as SubscriberProperties | null) ?? {};

    return getSuppressionDecision({
      activeReasons: activeSuppressions.map((item) => item.reason),
      messageKind,
      subscriberEmailStatus: properties.email_status,
      subscriberSubscribed:
        typeof subscriber?.subscribed === "boolean"
          ? subscriber.subscribed
          : undefined,
    });
  }

  async markDiscountRedeemed(code: string, orderId: string) {
    const discount = (await this.listEmailDiscountCodes({ code }))[0];
    if (!discount || discount.redeemed_at) {
      return null;
    }

    return this.updateEmailDiscountCodes({
      id: discount.id,
      order_id: orderId,
      redeemed_at: new Date(),
    });
  }

  async insertCommerceEvent(data: {
    eventId: string;
    eventType: string;
    payload: AnyRecord;
    source?: string;
  }) {
    const inserted = await this.db
      .insert(commerceEvents)
      .values({
        eventId: data.eventId,
        eventType: data.eventType,
        payload: data.payload,
        source: data.source ?? "commerce",
      })
      .onConflictDoNothing({ target: commerceEvents.eventId })
      .returning();

    return inserted[0] ? toPublicRecord(inserted[0] as AnyRecord) : null;
  }

  async retrieveCommerceEvent(id: string) {
    const rows = await this.db
      .select()
      .from(commerceEvents)
      .where(eq(commerceEvents.id, id));
    return rows[0] ? toPublicRecord(rows[0] as AnyRecord) : null;
  }

  async markCommerceEventProcessed(id: string) {
    await this.db
      .update(commerceEvents)
      .set({ processedAt: new Date() })
      .where(eq(commerceEvents.id, id));
  }

  async logIntegrationDelivery(data: {
    provider: "resend" | "medusa";
    eventId: string;
    status: string;
    request?: AnyRecord;
    response?: AnyRecord | null;
    error?: string | null;
    deliveredAt?: Date | null;
  }) {
    const [delivery] = await this.db
      .insert(integrationDeliveries)
      .values({
        deliveredAt: data.deliveredAt ?? null,
        error: data.error ?? null,
        eventId: data.eventId,
        provider: data.provider,
        request: data.request ?? {},
        response: data.response ?? null,
        status: data.status,
      })
      .onConflictDoUpdate({
        set: {
          deliveredAt: data.deliveredAt ?? null,
          error: data.error ?? null,
          lastAttemptAt: new Date(),
          request: data.request ?? {},
          response: data.response ?? null,
          status: data.status,
          attemptCount: sql`${integrationDeliveries.attemptCount} + 1`,
        },
        target: [integrationDeliveries.provider, integrationDeliveries.eventId],
      })
      .returning();

    return toPublicRecord(delivery as AnyRecord);
  }

  async claimDelivery(
    input: {
      campaignId?: string;
      campaignRecipientId?: string;
      campaignRevisionId?: string;
      flowId?: string;
      flowRunId?: string;
      flowVersionId?: string;
      idempotencyKey: string;
      messageKind: MessageKind;
      recipientEmail: string;
      templateId: string;
      templateVersionId?: string;
    },
    claimSeconds = 10 * 60,
  ) {
    const now = new Date();
    const claimExpiresAt = new Date(now.getTime() + claimSeconds * 1000);
    await this.db
      .insert(emailDeliveryLedger)
      .values({
        campaignId: input.campaignId ?? null,
        campaignRecipientId: input.campaignRecipientId ?? null,
        campaignRevisionId: input.campaignRevisionId ?? null,
        flowId: input.flowId ?? null,
        flowRunId: input.flowRunId ?? null,
        flowVersionId: input.flowVersionId ?? null,
        idempotencyKey: input.idempotencyKey,
        messageKind: input.messageKind,
        recipientEmail: normalizeEmail(input.recipientEmail),
        templateId: input.templateId,
        templateVersionId: input.templateVersionId ?? null,
      })
      .onConflictDoNothing({ target: emailDeliveryLedger.idempotencyKey });

    const [existing] = await this.db
      .select()
      .from(emailDeliveryLedger)
      .where(eq(emailDeliveryLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (!existing) {
      throw new Error("Delivery ledger row was not created");
    }
    if (
      existing.state === "sent" ||
      existing.state === "dry_run" ||
      existing.state === "skipped"
    ) {
      return {
        claim: "complete" as const,
        delivery: toPublicRecord(existing as AnyRecord),
      };
    }
    if (
      existing.state === "sending" &&
      existing.claimExpiresAt &&
      existing.claimExpiresAt.getTime() > now.getTime()
    ) {
      return {
        claim: "busy" as const,
        delivery: toPublicRecord(existing as AnyRecord),
      };
    }

    const [claimed] = await this.db
      .update(emailDeliveryLedger)
      .set({
        attemptCount: sql`${emailDeliveryLedger.attemptCount} + 1`,
        claimedAt: now,
        claimExpiresAt,
        lastError: null,
        state: "sending",
        updatedAt: now,
      })
      .where(
        and(
          eq(emailDeliveryLedger.id, existing.id),
          or(
            inArray(emailDeliveryLedger.state, ["pending", "failed"]),
            and(
              eq(emailDeliveryLedger.state, "sending"),
              or(
                isNull(emailDeliveryLedger.claimExpiresAt),
                lte(emailDeliveryLedger.claimExpiresAt, now),
              ),
            ),
          ),
        ),
      )
      .returning();

    return claimed
      ? {
          claim: "acquired" as const,
          delivery: toPublicRecord(claimed as AnyRecord),
        }
      : {
          claim: "busy" as const,
          delivery: toPublicRecord(existing as AnyRecord),
        };
  }

  async completeDelivery(
    idempotencyKey: string,
    input: {
      providerId?: string | null;
      state?: "sent" | "dry_run" | "skipped";
    },
  ) {
    const [delivery] = await this.db
      .update(emailDeliveryLedger)
      .set({
        claimExpiresAt: null,
        lastError: null,
        providerId: input.providerId ?? null,
        state: input.state ?? "sent",
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveryLedger.idempotencyKey, idempotencyKey))
      .returning();
    return delivery ? toPublicRecord(delivery as AnyRecord) : null;
  }

  async failDelivery(idempotencyKey: string, error: string) {
    const [delivery] = await this.db
      .update(emailDeliveryLedger)
      .set({
        claimExpiresAt: null,
        lastError: error.slice(0, 2000),
        state: "failed",
        updatedAt: new Date(),
      })
      .where(eq(emailDeliveryLedger.idempotencyKey, idempotencyKey))
      .returning();
    return delivery ? toPublicRecord(delivery as AnyRecord) : null;
  }

  async snapshotCampaignRecipients(
    campaignId: string,
    campaignRevisionId: string,
    subscribers: AnyRecord[],
  ) {
    return this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .select({
          audienceSnapshottedAt: emailCampaigns.audienceSnapshottedAt,
        })
        .from(emailCampaigns)
        .where(eq(emailCampaigns.id, campaignId))
        .for("update")
        .limit(1);
      if (!campaign) {
        throw new Error(`Campaign not found: ${campaignId}`);
      }

      if (!campaign.audienceSnapshottedAt) {
        if (subscribers.length > 0) {
          await tx
            .insert(emailCampaignRecipients)
            .values(
              subscribers.map((subscriber) => {
                const subscriberId = String(subscriber.id);
                return {
                  campaignId,
                  campaignRevisionId,
                  deliveryKey: `campaign/${campaignId}/${subscriberId}`,
                  email: normalizeEmail(String(subscriber.email)),
                  subscriberId,
                };
              }),
            )
            .onConflictDoNothing({
              target: [
                emailCampaignRecipients.campaignId,
                emailCampaignRecipients.email,
              ],
            });
        }
        await tx
          .update(emailCampaigns)
          .set({
            audienceSnapshottedAt: new Date(),
            recipientCount: subscribers.length,
            updatedAt: new Date(),
          })
          .where(eq(emailCampaigns.id, campaignId));
      }

      const rows = await tx
        .select()
        .from(emailCampaignRecipients)
        .where(eq(emailCampaignRecipients.campaignId, campaignId));
      return rows.map((row) => toPublicRecord(row as AnyRecord));
    });
  }

  async listCampaignRecipients(campaignId: string) {
    const rows = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId));
    return rows.map((row) => toPublicRecord(row as AnyRecord));
  }

  async retrieveCampaignRecipient(id: string) {
    const [row] = await this.db
      .select()
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.id, id))
      .limit(1);
    return row ? toPublicRecord(row as AnyRecord) : null;
  }

  async claimCampaignRecipient(id: string, claimSeconds = 10 * 60) {
    const now = new Date();
    const [claimed] = await this.db
      .update(emailCampaignRecipients)
      .set({
        attemptCount: sql`${emailCampaignRecipients.attemptCount} + 1`,
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + claimSeconds * 1000),
        lastError: null,
        state: "sending",
        updatedAt: now,
      })
      .where(
        and(
          eq(emailCampaignRecipients.id, id),
          or(
            inArray(emailCampaignRecipients.state, ["pending", "failed"]),
            and(
              eq(emailCampaignRecipients.state, "sending"),
              or(
                isNull(emailCampaignRecipients.claimExpiresAt),
                lte(emailCampaignRecipients.claimExpiresAt, now),
              ),
            ),
          ),
        ),
      )
      .returning();
    return claimed ? toPublicRecord(claimed as AnyRecord) : null;
  }

  async releaseCampaignRecipient(id: string) {
    await this.db
      .update(emailCampaignRecipients)
      .set({
        state: "pending",
        claimedAt: null,
        claimExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailCampaignRecipients.id, id),
          eq(emailCampaignRecipients.state, "sending"),
        ),
      );
  }

  async completeCampaignRecipient(
    id: string,
    state: "sent" | "failed" | "skipped",
    input: { error?: string; providerId?: string | null } = {},
  ) {
    const [row] = await this.db
      .update(emailCampaignRecipients)
      .set({
        claimExpiresAt: null,
        lastError: input.error?.slice(0, 2000) ?? null,
        providerId: input.providerId ?? null,
        state,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaignRecipients.id, id))
      .returning();
    return row ? toPublicRecord(row as AnyRecord) : null;
  }

  async refreshCampaignCounts(campaignId: string) {
    const counts = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        state: emailCampaignRecipients.state,
      })
      .from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.campaignId, campaignId))
      .groupBy(emailCampaignRecipients.state);
    const byState = Object.fromEntries(
      counts.map((row) => [row.state, Number(row.count)]),
    );
    const recipientCount = Object.values(byState).reduce(
      (sum, count) => sum + count,
      0,
    );
    const sentCount = byState.sent ?? 0;
    const failedCount = byState.failed ?? 0;
    const pendingCount = (byState.pending ?? 0) + (byState.sending ?? 0);
    const [campaign] = await this.db
      .update(emailCampaigns)
      .set({
        failedCount,
        recipientCount,
        sentCount,
        updatedAt: new Date(),
      })
      .where(eq(emailCampaigns.id, campaignId))
      .returning();
    return {
      campaign: campaign ? toPublicRecord(campaign as AnyRecord) : null,
      failedCount,
      pendingCount,
      recipientCount,
      sentCount,
      skippedCount: byState.skipped ?? 0,
    };
  }

  async reserveDiscountForStep(input: {
    code: string;
    currencyCode?: string | null;
    discountType: "percentage" | "fixed";
    discountValue: number;
    expiresAt?: Date | null;
    flowId: string;
    flowRunId: string;
    stepKey: string;
    subscriberEmail: string;
    usageLimit: number;
  }) {
    const [inserted] = await this.db
      .insert(emailDiscountCodes)
      .values({
        code: input.code,
        currencyCode: input.currencyCode ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        expiresAt: input.expiresAt ?? null,
        flowId: input.flowId,
        flowRunId: input.flowRunId,
        id: createId("emdisc"),
        promotionId: null,
        stepKey: input.stepKey,
        subscriberEmail: normalizeEmail(input.subscriberEmail),
        usageLimit: input.usageLimit,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return { created: true, discount: toPublicRecord(inserted as AnyRecord) };
    }
    const [existing] = await this.db
      .select()
      .from(emailDiscountCodes)
      .where(
        and(
          eq(emailDiscountCodes.flowRunId, input.flowRunId),
          eq(emailDiscountCodes.stepKey, input.stepKey),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new Error("Could not reserve discount code");
    }
    return { created: false, discount: toPublicRecord(existing as AnyRecord) };
  }

  async completeDiscountPromotion(id: string, promotionId: string) {
    const [row] = await this.db
      .update(emailDiscountCodes)
      .set({ promotionId, updatedAt: new Date() })
      .where(eq(emailDiscountCodes.id, id))
      .returning();
    return row ? toPublicRecord(row as AnyRecord) : null;
  }

  async recordAdminAudit(input: {
    action: string;
    actorEmail: string;
    outcome: string;
    requestId: string;
    resourceId?: string;
    resourceType: string;
  }) {
    await this.db.insert(adminAuditLogs).values({
      action: input.action,
      actorEmail: normalizeEmail(input.actorEmail),
      outcome: input.outcome,
      requestId: input.requestId,
      resourceId: input.resourceId ?? null,
      resourceType: input.resourceType,
    });
  }

  async consumePublicRateLimit(input: {
    action: string;
    keyHash: string;
    limit: number;
    now?: Date;
    windowSeconds: number;
  }) {
    const now = input.now ?? new Date();
    const windowMs = input.windowSeconds * 1000;
    const windowStart = new Date(
      Math.floor(now.getTime() / windowMs) * windowMs,
    );
    const expiresAt = new Date(windowStart.getTime() + windowMs * 2);

    if (Math.random() < 0.02) {
      await this.db
        .delete(publicRateLimits)
        .where(lt(publicRateLimits.expiresAt, now));
    }

    const [bucket] = await this.db
      .insert(publicRateLimits)
      .values({
        action: input.action,
        count: 1,
        expiresAt,
        keyHash: input.keyHash,
        windowStart,
      })
      .onConflictDoUpdate({
        set: {
          count: sql`${publicRateLimits.count} + 1`,
          expiresAt,
          updatedAt: now,
        },
        target: [
          publicRateLimits.action,
          publicRateLimits.keyHash,
          publicRateLimits.windowStart,
        ],
      })
      .returning({ count: publicRateLimits.count });

    const count = bucket?.count ?? input.limit + 1;
    return {
      allowed: count <= input.limit,
      count,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
      ),
    };
  }

  async getDashboardStats() {
    const [events, subscribers, campaigns, flows, suppressions] =
      await Promise.all([
        this.db.select({ count: sql<number>`count(*)::int` }).from(emailEvents),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailSubscribers)
          .where(isNull(emailSubscribers.deletedAt)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailCampaigns)
          .where(isNull(emailCampaigns.deletedAt)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(emailFlows)
          .where(isNull(emailFlows.deletedAt)),
        this.db
          .select({ count: sql<number>`count(*)::int` })
          .from(messageSuppressions)
          .where(eq(messageSuppressions.active, true)),
      ]);

    return {
      active_suppressions: suppressions[0]?.count ?? 0,
      campaigns: campaigns[0]?.count ?? 0,
      email_events: events[0]?.count ?? 0,
      flows: flows[0]?.count ?? 0,
      subscribers: subscribers[0]?.count ?? 0,
    };
  }

  async getAdminSettings() {
    const installation = await installationRow();
    const [[lastCommerceEvent], runtime] = await Promise.all([
      this.db
        .select()
        .from(commerceEvents)
        .orderBy(desc(commerceEvents.receivedAt))
        .limit(1),
      this.getRuntimeSettings(),
    ]);
    return {
      env: {
        app_url: process.env.APP_URL ?? null,
        commerce_command_configured: Boolean(
          process.env.COMMERCE_COMMAND_URL &&
          process.env.COMMERCE_COMMAND_SHARED_SECRET,
        ),
        commerce_event_secret_configured: Boolean(
          process.env.COMMERCE_EVENT_WEBHOOK_SECRET ??
          process.env.MEDUSA_EVENT_WEBHOOK_SECRET,
        ),
        commerce_mode: process.env.MESSAGING_MODE ?? null,
        resend_api_key_configured: Boolean(
          installation.credentials.resendApiKey || process.env.RESEND_API_KEY,
        ),
        resend_webhook_secret_configured: Boolean(
          installation.credentials.resendWebhookSecret ||
          process.env.RESEND_WEBHOOK_SECRET,
        ),
      },
      runtime: {
        email_from: runtime.emailFrom,
        email_logo_url: runtime.emailLogoUrl,
        email_sender_name: runtime.emailSenderName,
        source: runtime.source,
      },
      commerce_handshake: {
        last_event: lastCommerceEvent
          ? toPublicRecord(lastCommerceEvent as AnyRecord)
          : null,
      },
    };
  }

  async getRuntimeSettings(): Promise<MessagingRuntimeSettings> {
    const rows = await this.db
      .select({ key: runtimeSettings.key, value: runtimeSettings.value })
      .from(runtimeSettings)
      .where(inArray(runtimeSettings.key, Object.values(RUNTIME_SETTING_KEYS)));
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const environmentValues = {
      emailFrom: process.env.EMAIL_FROM?.trim(),
      emailLogoUrl: process.env.EMAIL_LOGO_URL?.trim() || undefined,
      emailSenderName: process.env.EMAIL_SENDER_NAME?.trim(),
    };
    if (
      environmentValues.emailLogoUrl &&
      !isValidEmailLogoUrl(environmentValues.emailLogoUrl)
    ) {
      throw new Error("EMAIL_LOGO_URL must be an absolute HTTPS URL");
    }
    const hasEnvironmentFallback = Object.values(environmentValues).some(
      (value) => value !== undefined,
    );
    return {
      emailFrom:
        runtimeString(values.get(RUNTIME_SETTING_KEYS.emailFrom)) ??
        environmentValues.emailFrom ??
        runtimeDefaults.emailFrom,
      emailLogoUrl:
        runtimeString(values.get(RUNTIME_SETTING_KEYS.emailLogoUrl), true) ??
        environmentValues.emailLogoUrl ??
        runtimeDefaults.emailLogoUrl,
      emailSenderName:
        runtimeString(values.get(RUNTIME_SETTING_KEYS.emailSenderName)) ??
        environmentValues.emailSenderName ??
        runtimeDefaults.emailSenderName,
      source:
        values.size === Object.keys(RUNTIME_SETTING_KEYS).length
          ? "database"
          : hasEnvironmentFallback
            ? "environment"
            : "defaults",
    };
  }

  async updateRuntimeSettings(input: MessagingRuntimeSettingsUpdate) {
    const current = await this.getRuntimeSettings();
    const next = {
      emailFrom: input.emailFrom?.trim() ?? current.emailFrom,
      emailLogoUrl: input.emailLogoUrl?.trim() ?? current.emailLogoUrl,
      emailSenderName: input.emailSenderName?.trim() ?? current.emailSenderName,
    };
    if (!/^\S+@\S+\.\S+$/.test(next.emailFrom)) {
      throw new Error("A valid sender email is required");
    }
    if (!next.emailSenderName) {
      throw new Error("A sender name is required");
    }
    if (!isValidEmailLogoUrl(next.emailLogoUrl)) {
      throw new Error("Email logo must be an absolute HTTPS URL");
    }
    for (const [field, key] of Object.entries(RUNTIME_SETTING_KEYS)) {
      await this.db
        .insert(runtimeSettings)
        .values({ key, value: next[field as keyof typeof next] })
        .onConflictDoUpdate({
          set: {
            updatedAt: new Date(),
            value: next[field as keyof typeof next],
          },
          target: runtimeSettings.key,
        });
    }
    return this.getRuntimeSettings();
  }

  async getEmailTemplateBrandContext(
    runtime?: MessagingRuntimeSettings,
  ): Promise<Record<string, string>> {
    const settings = runtime ?? (await this.getRuntimeSettings());
    const installation = await installationRow();
    return {
      email_logo_url: settings.emailLogoUrl,
      store_name: installation.merchant?.storeName ?? settings.emailSenderName,
      store_url:
        installation.merchant?.storefrontUrl ??
        process.env.STOREFRONT_URL?.replace(/\/$/, "") ??
        "https://example.com",
    };
  }

  private async checkFlowReentry(flow: AnyRecord, email: string) {
    const normalizedEmail = normalizeEmail(email);

    const previousRuns = await this.listEmailFlowRuns({
      flow_id: flow.id,
      subscriber_email: normalizedEmail,
    });
    return getFlowReentryDecision({
      duration: Number(flow.reentry_duration ?? 0),
      mode:
        typeof flow.reentry_mode === "string" ? flow.reentry_mode : undefined,
      previousRuns,
      unit:
        typeof flow.reentry_unit === "string" ? flow.reentry_unit : undefined,
    });
  }
}

let service: MessagingService | undefined;

export function getMessagingService(db: EilishMessagingDb = getDb()) {
  if (!service) {
    service = new MessagingService(db);
  }

  return service;
}
