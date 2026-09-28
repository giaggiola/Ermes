export type JsonRecord = Record<string, unknown>;

export interface SubscriberProperties extends JsonRecord {
  tags?: string[];
  email_status?: "active" | "bounced" | "complained";
}

export interface CampaignFilter extends JsonRecord {
  tags?: string[];
  exclude_tags?: string[];
  segment_ids?: string[];
  exclude_segment_ids?: string[];
}

export interface TriggerCondition {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "in_list"
    | "has_tag"
    | "not_has_tag"
    | "greater_than"
    | "less_than";
  value: string | string[];
}

export interface TriggerConditionGroup {
  match: "all" | "any";
  conditions: TriggerCondition[];
}

export type TriggerConditionInput = TriggerCondition[] | TriggerConditionGroup;

export type FlowStepEmail = {
  step_id?: string;
  type: "email";
  template_id: string;
  template_version_id?: string;
  name?: string;
  step_status?: "live" | "disabled";
  subject_override?: string;
  preview_text_override?: string;
  sender_name_override?: string;
  sender_email_override?: string;
  skip_recently_emailed?: boolean;
  skip_recently_emailed_hours?: number;
  skip_if_event_types_since_start?: string[];
  skip_if_event_types_since_start_order_scoped?: boolean;
  enable_utm?: boolean;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ab_test_enabled?: boolean;
  ab_test_flag?: string;
  ab_variants?: Record<
    string,
    {
      template_id: string;
      template_version_id?: string;
      subject_override?: string;
    }
  >;
};

export type FlowStepDelay = {
  step_id?: string;
  type: "delay";
  duration: number;
  unit: "minutes" | "hours" | "days";
  timezone?: string;
  until_time_of_day?: boolean;
  time_of_day?: string;
  until_days_of_week?: boolean;
  days_of_week?: number[];
};

export type FlowConditionClause = {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_set" | "is_not_set";
  value: string;
};

export type FlowStepCondition = {
  step_id?: string;
  type: "condition";
  field?: string;
  operator?: FlowConditionClause["operator"];
  value?: string;
  match?: "all" | "any";
  conditions?: FlowConditionClause[];
  true_branch?: FlowStep[];
  false_branch?: FlowStep[];
};

export type FlowStepDiscount = {
  step_id?: string;
  type: "discount";
  discount_type: "percentage" | "fixed";
  discount_value: number;
  code_prefix: string;
  currency_code?: string;
  usage_limit: number;
  expires_in_days?: number;
  min_purchase?: number;
};

export type FlowStep = FlowStepEmail | FlowStepDelay | FlowStepCondition | FlowStepDiscount;

export interface FlowTriggerResult {
  flowId: string;
  flowName: string;
  jobId: string | undefined;
  skipped?: boolean;
  reason?: string;
}
