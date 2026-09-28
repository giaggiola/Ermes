ALTER TYPE "email_event_type"
  ADD VALUE IF NOT EXISTS 'skipped';

CREATE TABLE IF NOT EXISTS "email_marketing_send_state" (
  "email" text PRIMARY KEY,
  "last_attempt_at" timestamp with time zone NOT NULL,
  "last_source" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "IDX_email_marketing_send_state_last_attempt"
  ON "email_marketing_send_state" ("last_attempt_at");

INSERT INTO "email_marketing_send_state" (
  "email",
  "last_attempt_at",
  "last_source",
  "created_at",
  "updated_at"
)
SELECT
  lower("subscriber_email"),
  max("created_at"),
  'historical-email-event',
  min("created_at"),
  max("created_at")
FROM "email_event"
WHERE "event_type" = 'sent'
  AND "deleted_at" IS NULL
GROUP BY lower("subscriber_email")
ON CONFLICT ("email") DO UPDATE
SET
  "last_attempt_at" = GREATEST(
    "email_marketing_send_state"."last_attempt_at",
    EXCLUDED."last_attempt_at"
  ),
  "last_source" = CASE
    WHEN EXCLUDED."last_attempt_at" >
      "email_marketing_send_state"."last_attempt_at"
    THEN EXCLUDED."last_source"
    ELSE "email_marketing_send_state"."last_source"
  END,
  "updated_at" = GREATEST(
    "email_marketing_send_state"."updated_at",
    EXCLUDED."updated_at"
  );
