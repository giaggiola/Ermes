CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN CREATE TYPE "delivery_provider" AS ENUM ('resend', 'medusa'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "discount_type" AS ENUM ('percentage', 'fixed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_campaign_status" AS ENUM ('draft', 'scheduled', 'sending', 'sent', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_event_type" AS ENUM ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_flow_status" AS ENUM ('draft', 'active', 'paused'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "email_flow_run_status" AS ENUM ('running', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "message_channel" AS ENUM ('email'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "product_watch_alert_type" AS ENUM ('back-in-stock', 'price-drop'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "reentry_mode" AS ENUM ('never', 'after_duration'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "reentry_unit" AS ENUM ('hours', 'days'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "suppression_reason" AS ENUM ('bounce', 'complaint', 'manual', 'unsubscribe'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "email_template" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "html_content" text NOT NULL,
  "text_content" text,
  "variables" jsonb,
  "category" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_flow" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "trigger_event" text NOT NULL,
  "trigger_conditions" jsonb,
  "steps" jsonb NOT NULL,
  "status" "email_flow_status" DEFAULT 'draft' NOT NULL,
  "reentry_mode" "reentry_mode" DEFAULT 'never' NOT NULL,
  "reentry_duration" integer,
  "reentry_unit" "reentry_unit",
  "trigger_delay_hours" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_flow_run" (
  "id" text PRIMARY KEY NOT NULL,
  "flow_id" text NOT NULL,
  "subscriber_email" text NOT NULL,
  "context" jsonb NOT NULL,
  "current_step_index" integer DEFAULT 0 NOT NULL,
  "status" "email_flow_run_status" DEFAULT 'running' NOT NULL,
  "started_at" timestamptz NOT NULL,
  "completed_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_subscriber" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "properties" jsonb,
  "subscribed" boolean DEFAULT true NOT NULL,
  "subscription_source" text,
  "subscribed_at" timestamptz,
  "unsubscribed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_event" (
  "id" text PRIMARY KEY NOT NULL,
  "flow_run_id" text,
  "template_id" text,
  "subscriber_email" text NOT NULL,
  "event_type" "email_event_type" NOT NULL,
  "message_id" text,
  "metadata" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_campaign" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "template_id" text NOT NULL,
  "subscriber_filter" jsonb,
  "status" "email_campaign_status" DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamptz,
  "sent_at" timestamptz,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "context" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_product_watch" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "product_id" text NOT NULL,
  "variant_id" text,
  "alert_type" "product_watch_alert_type" NOT NULL,
  "reference_price" double precision,
  "currency_code" text,
  "notified" boolean DEFAULT false NOT NULL,
  "notified_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "email_discount_code" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "promotion_id" text NOT NULL,
  "flow_id" text NOT NULL,
  "flow_run_id" text NOT NULL,
  "subscriber_email" text NOT NULL,
  "discount_type" "discount_type" NOT NULL,
  "discount_value" double precision NOT NULL,
  "currency_code" text,
  "usage_limit" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamptz,
  "redeemed_at" timestamptz,
  "order_id" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "commerce_event" (
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "processed_at" timestamptz,
  "received_at" timestamptz DEFAULT now() NOT NULL,
  "source" text DEFAULT 'medusa' NOT NULL
);

CREATE TABLE IF NOT EXISTS "integration_delivery" (
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "delivered_at" timestamptz,
  "error" text,
  "event_id" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "last_attempt_at" timestamptz,
  "provider" "delivery_provider" NOT NULL,
  "request" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "response" jsonb,
  "status" text DEFAULT 'pending' NOT NULL
);

CREATE TABLE IF NOT EXISTS "message_suppression" (
  "active" boolean DEFAULT true NOT NULL,
  "channel" "message_channel" DEFAULT 'email' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "email" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  "reason" "suppression_reason" NOT NULL,
  "source" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_email_template_deleted_at" ON "email_template" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_template_is_active" ON "email_template" ("is_active");
CREATE INDEX IF NOT EXISTS "IDX_email_template_category" ON "email_template" ("category");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_deleted_at" ON "email_flow" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_status" ON "email_flow" ("status");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_trigger_event" ON "email_flow" ("trigger_event");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_status_trigger" ON "email_flow" ("status", "trigger_event");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_run_deleted_at" ON "email_flow_run" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_run_flow_id" ON "email_flow_run" ("flow_id");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_run_status" ON "email_flow_run" ("status");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_run_subscriber_email" ON "email_flow_run" ("subscriber_email");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_run_flow_status" ON "email_flow_run" ("flow_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_subscriber_email_unique" ON "email_subscriber" ("email") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_email_subscriber_deleted_at" ON "email_subscriber" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_subscriber_subscribed" ON "email_subscriber" ("subscribed");
CREATE INDEX IF NOT EXISTS "IDX_email_subscriber_source" ON "email_subscriber" ("subscription_source");
CREATE INDEX IF NOT EXISTS "IDX_email_event_deleted_at" ON "email_event" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_event_flow_run_id" ON "email_event" ("flow_run_id");
CREATE INDEX IF NOT EXISTS "IDX_email_event_subscriber_email" ON "email_event" ("subscriber_email");
CREATE INDEX IF NOT EXISTS "IDX_email_event_event_type" ON "email_event" ("event_type");
CREATE INDEX IF NOT EXISTS "IDX_email_event_message_id" ON "email_event" ("message_id");
CREATE INDEX IF NOT EXISTS "IDX_email_event_created_at" ON "email_event" ("created_at");
CREATE INDEX IF NOT EXISTS "IDX_email_event_subscriber_type" ON "email_event" ("subscriber_email", "event_type");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_deleted_at" ON "email_campaign" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_status" ON "email_campaign" ("status");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_scheduled_at" ON "email_campaign" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_deleted_at" ON "email_product_watch" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_email" ON "email_product_watch" ("email");
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_product_id" ON "email_product_watch" ("product_id");
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_alert_type" ON "email_product_watch" ("alert_type");
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_notified" ON "email_product_watch" ("notified");
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_product_watch_unique" ON "email_product_watch" ("email", "product_id", "variant_id", "alert_type") WHERE deleted_at IS NULL AND notified = false;
CREATE INDEX IF NOT EXISTS "IDX_email_product_watch_alert_notified" ON "email_product_watch" ("alert_type", "notified");
CREATE INDEX IF NOT EXISTS "IDX_email_discount_code_deleted_at" ON "email_discount_code" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_discount_code_code" ON "email_discount_code" ("code");
CREATE INDEX IF NOT EXISTS "IDX_email_discount_code_subscriber_email" ON "email_discount_code" ("subscriber_email");
CREATE INDEX IF NOT EXISTS "IDX_email_discount_code_flow_id" ON "email_discount_code" ("flow_id");
CREATE UNIQUE INDEX IF NOT EXISTS "commerce_event_event_id_idx" ON "commerce_event" ("event_id");
CREATE INDEX IF NOT EXISTS "commerce_event_event_type_idx" ON "commerce_event" ("event_type");
CREATE INDEX IF NOT EXISTS "commerce_event_processed_at_idx" ON "commerce_event" ("processed_at");
CREATE INDEX IF NOT EXISTS "commerce_event_received_at_idx" ON "commerce_event" ("received_at");
CREATE UNIQUE INDEX IF NOT EXISTS "integration_delivery_provider_event_idx" ON "integration_delivery" ("provider", "event_id");
CREATE INDEX IF NOT EXISTS "integration_delivery_status_idx" ON "integration_delivery" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "message_suppression_email_channel_reason_idx" ON "message_suppression" ("email", "channel", "reason");
CREATE INDEX IF NOT EXISTS "message_suppression_active_idx" ON "message_suppression" ("active");
