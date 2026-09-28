ALTER TYPE "signup_form_type" ADD VALUE IF NOT EXISTS 'embedded';
ALTER TYPE "signup_form_type" ADD VALUE IF NOT EXISTS 'full-page';

CREATE TABLE IF NOT EXISTS "email_consent_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "channel" "message_channel" DEFAULT 'email' NOT NULL,
  "topic" text DEFAULT 'marketing' NOT NULL,
  "action" text NOT NULL,
  "source" text NOT NULL,
  "metadata" jsonb,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_email_consent_event_email"
  ON "email_consent_event" ("email");
CREATE INDEX IF NOT EXISTS "IDX_email_consent_event_occurred_at"
  ON "email_consent_event" ("occurred_at");
CREATE INDEX IF NOT EXISTS "IDX_email_consent_event_topic_action"
  ON "email_consent_event" ("topic", "action");

INSERT INTO "email_consent_event" (
  "email",
  "action",
  "source",
  "occurred_at"
)
SELECT
  subscriber."email",
  CASE WHEN subscriber."subscribed" THEN 'subscribed' ELSE 'unsubscribed' END,
  COALESCE(subscriber."subscription_source", 'migration'),
  COALESCE(
    CASE
      WHEN subscriber."subscribed" THEN subscriber."subscribed_at"
      ELSE subscriber."unsubscribed_at"
    END,
    subscriber."created_at"
  )
FROM "email_subscriber" subscriber
WHERE NOT EXISTS (
  SELECT 1
  FROM "email_consent_event" consent
  WHERE consent."email" = subscriber."email"
);

CREATE TABLE IF NOT EXISTS "email_segment" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "rules" jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "estimated_count" integer DEFAULT 0 NOT NULL,
  "last_evaluated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "IDX_email_segment_deleted_at"
  ON "email_segment" ("deleted_at");
CREATE INDEX IF NOT EXISTS "IDX_email_segment_status"
  ON "email_segment" ("status");

CREATE TABLE IF NOT EXISTS "email_segment_member" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "segment_id" text NOT NULL,
  "subscriber_id" text NOT NULL,
  "email" text NOT NULL,
  "matched_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_segment_member_segment_subscriber_unique"
  ON "email_segment_member" ("segment_id", "subscriber_id");
CREATE INDEX IF NOT EXISTS "IDX_email_segment_member_email"
  ON "email_segment_member" ("email");
CREATE INDEX IF NOT EXISTS "IDX_email_segment_member_segment_id"
  ON "email_segment_member" ("segment_id");
