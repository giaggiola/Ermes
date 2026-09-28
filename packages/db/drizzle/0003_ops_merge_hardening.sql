ALTER TABLE "email_flow_run"
  ADD COLUMN IF NOT EXISTS "source_event_id" text,
  ADD COLUMN IF NOT EXISTS "steps_snapshot" jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_flow_run_source_event_unique"
  ON "email_flow_run" ("flow_id", "subscriber_email", "source_event_id")
  WHERE "source_event_id" IS NOT NULL;

ALTER TABLE "email_discount_code"
  ADD COLUMN IF NOT EXISTS "step_key" text;

ALTER TABLE "email_discount_code"
  ALTER COLUMN "promotion_id" DROP NOT NULL;

ALTER TABLE "email_campaign"
  ADD COLUMN IF NOT EXISTS "audience_snapshotted_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_discount_code_flow_run_step_unique"
  ON "email_discount_code" ("flow_run_id", "step_key")
  WHERE "step_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "email_campaign_recipient" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" text NOT NULL,
  "subscriber_id" text,
  "email" text NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "delivery_key" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "provider_id" text,
  "claimed_at" timestamp with time zone,
  "claim_expires_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_campaign_recipient_campaign_email_unique"
  ON "email_campaign_recipient" ("campaign_id", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_campaign_recipient_delivery_key_unique"
  ON "email_campaign_recipient" ("delivery_key");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_recipient_state_claim"
  ON "email_campaign_recipient" ("campaign_id", "state", "claim_expires_at");

CREATE TABLE IF NOT EXISTS "email_delivery_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" text NOT NULL,
  "flow_id" text,
  "flow_run_id" text,
  "campaign_id" text,
  "campaign_recipient_id" uuid,
  "recipient_email" text NOT NULL,
  "template_id" text NOT NULL,
  "message_kind" text NOT NULL,
  "state" text DEFAULT 'pending' NOT NULL,
  "provider_id" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "claimed_at" timestamp with time zone,
  "claim_expires_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_delivery_ledger_idempotency_key_unique"
  ON "email_delivery_ledger" ("idempotency_key");
CREATE INDEX IF NOT EXISTS "IDX_email_delivery_ledger_flow_run"
  ON "email_delivery_ledger" ("flow_run_id");
CREATE INDEX IF NOT EXISTS "IDX_email_delivery_ledger_campaign"
  ON "email_delivery_ledger" ("campaign_id");
CREATE INDEX IF NOT EXISTS "IDX_email_delivery_ledger_state_claim"
  ON "email_delivery_ledger" ("state", "claim_expires_at");

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "actor_email" text NOT NULL,
  "action" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" text,
  "request_id" text NOT NULL,
  "outcome" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_admin_audit_log_created_at"
  ON "admin_audit_log" ("created_at");
CREATE INDEX IF NOT EXISTS "IDX_admin_audit_log_request_id"
  ON "admin_audit_log" ("request_id");

CREATE TABLE IF NOT EXISTS "public_rate_limit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "key_hash" text NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_public_rate_limit_bucket_unique"
  ON "public_rate_limit" ("action", "key_hash", "window_start");
CREATE INDEX IF NOT EXISTS "IDX_public_rate_limit_expires_at"
  ON "public_rate_limit" ("expires_at");
