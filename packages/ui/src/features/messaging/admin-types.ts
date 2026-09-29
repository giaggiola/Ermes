export type JsonRecord = Record<string, unknown>;

export interface SignupForm {
  id: string;
  name: string;
  type: "popup" | "flyout" | "embedded" | "full-page";
  status: "draft" | "published";
  document: import("./contracts/signup-form-schema").SignupFormDocument;
  discount_flow_id?: string | null;
  submitted: number;
  impressions: number;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  draft_version_id?: string | null;
  published_version_id?: string | null;
}

export interface SignupFormVersion {
  id: string;
  form_id: string;
  version: number;
  document: import("./contracts/signup-form-schema").SignupFormDocument;
  created_at?: string;
  published_at?: string | null;
}

export interface SignupFormExperimentAudience {
  devices: Array<"desktop" | "mobile">;
  page_paths: string[];
  excluded_page_paths: string[];
  hide_when_logged_in: boolean;
}

export interface SignupFormExperimentVariantConfig {
  key: string;
  name: string;
  weight: number;
  version_id: string;
}

export interface SignupFormExperiment {
  id: string;
  form_id: string;
  name: string;
  status:
    | "draft"
    | "launching"
    | "running"
    | "paused"
    | "concluding"
    | "completed"
    | "canceled"
    | "integration_error";
  control_version_id: string;
  test_version_id: string;
  shared_audience: SignupFormExperimentAudience;
  exposure_event: "eligible" | "viewed";
  traffic_percentage: number;
  control_percentage: number;
  test_percentage: number;
  variants: SignupFormExperimentVariantConfig[];
  posthog_project_id?: string | null;
  posthog_experiment_id?: number | null;
  posthog_feature_flag_key: string;
  posthog_url?: string | null;
  posthog_snapshot?: Record<string, unknown> | null;
  winner?: string | null;
  last_error?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SignupFormExperimentDetail {
  experiment: SignupFormExperiment;
  control_variant?: SignupFormExperimentVariant | null;
  test_variant?: SignupFormExperimentVariant | null;
  variants: SignupFormExperimentVariant[];
  variant_error?: string | null;
  posthog?: Record<string, unknown> | null;
  posthog_error?: string | null;
}

export interface SignupFormExperimentVariant {
  key: string;
  name: string;
  weight: number;
  id: string;
  document: import("./contracts/signup-form-schema").SignupFormDocument;
  created_at?: string | null;
}

export interface SignupFormAnalyticsRow {
  diagnostics?: {
    since: string | null;
    tracked_views: number;
    untracked_views: number;
    dismissed_close: number;
    dismissed_backdrop: number;
    dismissed_escape: number;
    validation_failures: number;
    submit_failures: number;
    failure_reasons: Record<string, number>;
  };
  failure_reasons?: Record<string, number>;
  dismissals?: number;
  dismissed_close?: number;
  dismissed_backdrop?: number;
  dismissed_escape?: number;
  validation_failures?: number;
  submit_failures?: number;
  clicks: number;
  click_through_rate: number;
  form_id: string;
  submits: number;
  submit_rate: number;
  unique_clicks: number;
  unique_click_through_rate: number;
  unique_submits: number;
  unique_submit_rate: number;
  unique_views: number;
  views: number;
}

export interface SignupFormAnalytics {
  forms: SignupFormAnalyticsRow[];
  range: {
    from: string;
    time_zone: "UTC";
    to: string;
  };
}

export interface DashboardStats {
  active_suppressions: number;
  campaigns: number;
  email_events: number;
  flows: number;
  subscribers: number;
}

export interface DeliverabilityCounts {
  bounced: number;
  clicked: number;
  complained: number;
  delivered: number;
  opened: number;
  sent: number;
  unsubscribed: number;
}

export interface DeliverabilityMetrics extends DeliverabilityCounts {
  bounce_rate: number;
  click_rate: number;
  complaint_rate: number;
  delivery_rate: number;
  open_rate: number;
  unsubscribe_rate: number;
}

export interface DeliverabilityAnalytics {
  daily: Array<DeliverabilityCounts & { date: string }>;
  domains: Array<DeliverabilityMetrics & { domain: string }>;
  providers: Array<DeliverabilityMetrics & { provider: string }>;
  range: {
    from: string;
    time_zone: "UTC";
    to: string;
  };
  totals: DeliverabilityMetrics;
}

export interface EmailTemplate {
  document?: {
    kind: "tiptap";
    root: JsonRecord;
    schema_version: 1;
  } | null;
  editor_kind?: "legacy_html" | "visual_v1";
  id: string;
  name: string;
  preview_text?: string | null;
  subject: string;
  html_content: string;
  text_content?: string | null;
  variables?: unknown;
  category?: string | null;
  draft_version_id?: string | null;
  is_active: boolean;
  published_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
  version?: number;
}

export interface CampaignAudienceFilter extends JsonRecord {
  tags?: string[];
  exclude_tags?: string[];
  segment_ids?: string[];
  exclude_segment_ids?: string[];
}

export interface CampaignAnalytics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  open_rate: number;
  click_rate: number;
}

export interface FlowStepMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
}

export interface FlowAnalytics {
  step_metrics: Record<string, FlowStepMetrics>;
}

export interface TriggerMetric {
  event_type: string;
  count: number;
}

export interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  template_id: string;
  subscriber_filter?: CampaignAudienceFilter | null;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduled_at?: string | null;
  sent_at?: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  context?: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface EmailFlow {
  id: string;
  name: string;
  description?: string | null;
  graph_document?: {
    edges?: unknown[];
    nodes?: unknown[];
    schema_version: number;
  } | null;
  trigger_event: string;
  message_kind?: "marketing" | "transactional";
  trigger_conditions?: unknown;
  steps: unknown;
  tags?: string[] | null;
  status: "draft" | "active" | "paused";
  reentry_mode?: "never" | "after_duration" | "always";
  reentry_duration?: number | null;
  reentry_unit?: "hours" | "days" | null;
  trigger_delay_hours?: number;
  created_at?: string;
  updated_at?: string;
  validation_report?: {
    errors: string[];
    valid: boolean;
    warnings: string[];
  };
  version?: number;
}

export interface EmailFlowRun {
  id: string;
  flow_id: string;
  subscriber_email: string;
  context: unknown;
  current_step_index: number;
  status: "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at?: string | null;
  error_message?: string | null;
  created_at?: string;
}

export interface EmailSubscriber {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  properties?: JsonRecord | null;
  subscribed: boolean;
  subscription_source?: string | null;
  subscribed_at?: string | null;
  unsubscribed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SegmentOperator =
  | "contains"
  | "equals"
  | "exists"
  | "greater_than"
  | "in"
  | "less_than"
  | "not_contains"
  | "not_equals";

export interface SegmentCondition {
  field: string;
  operator: SegmentOperator;
  value?: string | string[];
}

export interface SegmentRuleGroup {
  conditions: SegmentCondition[];
  match: "all" | "any";
}

export interface EmailSegment {
  created_at?: string;
  description?: string | null;
  estimated_count: number;
  id: string;
  last_evaluated_at?: string | null;
  name: string;
  rules: SegmentRuleGroup;
  status: "active" | "draft";
  updated_at?: string;
}

export interface EmailEvent {
  id: string;
  flow_run_id?: string | null;
  template_id?: string | null;
  subscriber_email: string;
  event_type:
    | "sent"
    | "delivered"
    | "opened"
    | "clicked"
    | "bounced"
    | "complained"
    | "skipped";
  message_id?: string | null;
  metadata?: JsonRecord | null;
  created_at?: string;
}

export interface MessageSuppression {
  id: string;
  active: boolean;
  channel: "email";
  created_at?: string;
  email: string;
  reason: "bounce" | "complaint" | "manual" | "unsubscribe";
  source: string;
}

export interface AdminSettings {
  env: {
    app_url: string | null;
    commerce_command_configured: boolean;
    commerce_event_secret_configured: boolean;
    commerce_mode: string | null;
    resend_api_key_configured: boolean;
    resend_webhook_secret_configured: boolean;
  };
  runtime: {
    email_from: string;
    email_logo_url: string;
    email_sender_name: string;
    source: "database" | "environment" | "defaults";
  };
  commerce_handshake: {
    last_event: JsonRecord | null;
  };
}

export interface AdminSettingsUpdate {
  email_from: string;
  email_logo_url: string;
  email_sender_name: string;
}

export interface TemplatePreview {
  context_used: JsonRecord;
  preview: {
    html: string;
    subject: string;
    text: string | null;
  };
  template: Pick<
    EmailTemplate,
    "category" | "id" | "is_active" | "name" | "variables"
  >;
}
