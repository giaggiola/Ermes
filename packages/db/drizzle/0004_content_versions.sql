ALTER TABLE "email_template"
  ADD COLUMN IF NOT EXISTS "draft_version_id" text,
  ADD COLUMN IF NOT EXISTS "published_version_id" text,
  ADD COLUMN IF NOT EXISTS "preview_text" text;

CREATE TABLE IF NOT EXISTS "email_template_version" (
  "id" text PRIMARY KEY NOT NULL,
  "template_id" text NOT NULL,
  "version" integer NOT NULL,
  "editor_kind" text DEFAULT 'legacy_html' NOT NULL,
  "document" jsonb,
  "subject" text NOT NULL,
  "preview_text" text,
  "compiled_html" text NOT NULL,
  "compiled_text" text,
  "variables" jsonb,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_template_version_template_version_unique"
  ON "email_template_version" ("template_id", "version");
CREATE INDEX IF NOT EXISTS "IDX_email_template_version_template_id"
  ON "email_template_version" ("template_id");
CREATE INDEX IF NOT EXISTS "IDX_email_template_version_published_at"
  ON "email_template_version" ("published_at");

INSERT INTO "email_template_version" (
  "id",
  "template_id",
  "version",
  "editor_kind",
  "subject",
  "preview_text",
  "compiled_html",
  "compiled_text",
  "variables",
  "created_at",
  "published_at"
)
SELECT
  'emtv_' || replace(gen_random_uuid()::text, '-', ''),
  template."id",
  1,
  'legacy_html',
  template."subject",
  template."preview_text",
  template."html_content",
  template."text_content",
  template."variables",
  template."created_at",
  template."created_at"
FROM "email_template" template
WHERE NOT EXISTS (
  SELECT 1
  FROM "email_template_version" version
  WHERE version."template_id" = template."id"
);

UPDATE "email_template" template
SET
  "draft_version_id" = version."id",
  "published_version_id" = version."id"
FROM "email_template_version" version
WHERE
  version."template_id" = template."id"
  AND version."version" = 1
  AND (
    template."draft_version_id" IS NULL
    OR template."published_version_id" IS NULL
  );

ALTER TABLE "email_flow"
  ADD COLUMN IF NOT EXISTS "draft_version_id" text,
  ADD COLUMN IF NOT EXISTS "published_version_id" text;

CREATE TABLE IF NOT EXISTS "email_flow_version" (
  "id" text PRIMARY KEY NOT NULL,
  "flow_id" text NOT NULL,
  "version" integer NOT NULL,
  "graph_document" jsonb NOT NULL,
  "compiled_steps" jsonb NOT NULL,
  "validation_report" jsonb,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_flow_version_flow_version_unique"
  ON "email_flow_version" ("flow_id", "version");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_version_flow_id"
  ON "email_flow_version" ("flow_id");
CREATE INDEX IF NOT EXISTS "IDX_email_flow_version_published_at"
  ON "email_flow_version" ("published_at");

INSERT INTO "email_flow_version" (
  "id",
  "flow_id",
  "version",
  "graph_document",
  "compiled_steps",
  "validation_report",
  "created_at",
  "published_at"
)
SELECT
  'emfv_' || replace(gen_random_uuid()::text, '-', ''),
  flow."id",
  1,
  jsonb_build_object(
    'schema_version', 1,
    'trigger_event', flow."trigger_event",
    'trigger_conditions', COALESCE(flow."trigger_conditions", '[]'::jsonb),
    'steps', flow."steps"
  ),
  flow."steps",
  '{"valid":true,"errors":[],"warnings":[]}'::jsonb,
  flow."created_at",
  CASE WHEN flow."status" = 'active' THEN flow."updated_at" ELSE NULL END
FROM "email_flow" flow
WHERE NOT EXISTS (
  SELECT 1
  FROM "email_flow_version" version
  WHERE version."flow_id" = flow."id"
);

UPDATE "email_flow" flow
SET
  "draft_version_id" = version."id",
  "published_version_id" = CASE
    WHEN flow."status" = 'active' THEN version."id"
    ELSE flow."published_version_id"
  END
FROM "email_flow_version" version
WHERE
  version."flow_id" = flow."id"
  AND version."version" = 1
  AND flow."draft_version_id" IS NULL;

ALTER TABLE "email_flow_run"
  ADD COLUMN IF NOT EXISTS "flow_version_id" text;

UPDATE "email_flow_run" run
SET "flow_version_id" = flow."published_version_id"
FROM "email_flow" flow
WHERE run."flow_id" = flow."id" AND run."flow_version_id" IS NULL;

ALTER TABLE "email_campaign"
  ADD COLUMN IF NOT EXISTS "draft_revision_id" text,
  ADD COLUMN IF NOT EXISTS "send_revision_id" text;

CREATE TABLE IF NOT EXISTS "email_campaign_revision" (
  "id" text PRIMARY KEY NOT NULL,
  "campaign_id" text NOT NULL,
  "version" integer NOT NULL,
  "template_id" text NOT NULL,
  "template_version_id" text NOT NULL,
  "subject" text NOT NULL,
  "audience_definition" jsonb,
  "context" jsonb,
  "sender_name" text,
  "sender_email" text,
  "reply_to" text,
  "utm" jsonb,
  "scheduled_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "frozen_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_campaign_revision_campaign_version_unique"
  ON "email_campaign_revision" ("campaign_id", "version");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_revision_campaign_id"
  ON "email_campaign_revision" ("campaign_id");
CREATE INDEX IF NOT EXISTS "IDX_email_campaign_revision_frozen_at"
  ON "email_campaign_revision" ("frozen_at");

INSERT INTO "email_campaign_revision" (
  "id",
  "campaign_id",
  "version",
  "template_id",
  "template_version_id",
  "subject",
  "audience_definition",
  "context",
  "scheduled_at",
  "created_at",
  "frozen_at"
)
SELECT
  'emcr_' || replace(gen_random_uuid()::text, '-', ''),
  campaign."id",
  1,
  campaign."template_id",
  template."published_version_id",
  campaign."subject",
  campaign."subscriber_filter",
  campaign."context",
  campaign."scheduled_at",
  campaign."created_at",
  CASE
    WHEN campaign."status" IN ('scheduled', 'sending', 'sent', 'failed')
      THEN campaign."updated_at"
    ELSE NULL
  END
FROM "email_campaign" campaign
JOIN "email_template" template ON template."id" = campaign."template_id"
WHERE
  template."published_version_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "email_campaign_revision" revision
    WHERE revision."campaign_id" = campaign."id"
  );

UPDATE "email_campaign" campaign
SET
  "draft_revision_id" = revision."id",
  "send_revision_id" = CASE
    WHEN campaign."status" IN ('scheduled', 'sending', 'sent', 'failed')
      THEN revision."id"
    ELSE campaign."send_revision_id"
  END
FROM "email_campaign_revision" revision
WHERE
  revision."campaign_id" = campaign."id"
  AND revision."version" = 1
  AND campaign."draft_revision_id" IS NULL;

ALTER TABLE "signup_form"
  ADD COLUMN IF NOT EXISTS "draft_version_id" text,
  ADD COLUMN IF NOT EXISTS "published_version_id" text;

CREATE TABLE IF NOT EXISTS "signup_form_version" (
  "id" text PRIMARY KEY NOT NULL,
  "form_id" text NOT NULL,
  "version" integer NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "document" jsonb NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_signup_form_version_form_version_unique"
  ON "signup_form_version" ("form_id", "version");
CREATE INDEX IF NOT EXISTS "IDX_signup_form_version_form_id"
  ON "signup_form_version" ("form_id");
CREATE INDEX IF NOT EXISTS "IDX_signup_form_version_published_at"
  ON "signup_form_version" ("published_at");

INSERT INTO "signup_form_version" (
  "id",
  "form_id",
  "version",
  "schema_version",
  "document",
  "created_at",
  "published_at"
)
SELECT
  'formv_' || replace(gen_random_uuid()::text, '-', ''),
  form."id",
  1,
  CASE
    WHEN COALESCE(form."document" ->> 'schema_version', '') ~ '^[0-9]+$'
      THEN (form."document" ->> 'schema_version')::integer
    ELSE 1
  END,
  form."document",
  form."created_at",
  CASE WHEN form."status" = 'published' THEN form."published_at" ELSE NULL END
FROM "signup_form" form
WHERE NOT EXISTS (
  SELECT 1
  FROM "signup_form_version" version
  WHERE version."form_id" = form."id"
);

UPDATE "signup_form" form
SET
  "draft_version_id" = version."id",
  "published_version_id" = CASE
    WHEN form."status" = 'published' THEN version."id"
    ELSE form."published_version_id"
  END
FROM "signup_form_version" version
WHERE
  version."form_id" = form."id"
  AND version."version" = 1
  AND form."draft_version_id" IS NULL;

ALTER TABLE "email_campaign_recipient"
  ADD COLUMN IF NOT EXISTS "campaign_revision_id" text;

UPDATE "email_campaign_recipient" recipient
SET "campaign_revision_id" = campaign."send_revision_id"
FROM "email_campaign" campaign
WHERE recipient."campaign_id" = campaign."id"
  AND recipient."campaign_revision_id" IS NULL;

ALTER TABLE "email_delivery_ledger"
  ADD COLUMN IF NOT EXISTS "flow_version_id" text,
  ADD COLUMN IF NOT EXISTS "campaign_revision_id" text,
  ADD COLUMN IF NOT EXISTS "template_version_id" text;

ALTER TABLE "email_event"
  ADD COLUMN IF NOT EXISTS "campaign_id" text,
  ADD COLUMN IF NOT EXISTS "flow_step_key" text,
  ADD COLUMN IF NOT EXISTS "template_version_id" text,
  ADD COLUMN IF NOT EXISTS "provider_event_id" text,
  ADD COLUMN IF NOT EXISTS "attributed_order_id" text,
  ADD COLUMN IF NOT EXISTS "attributed_revenue" double precision;

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_email_event_provider_event_id_unique"
  ON "email_event" ("provider_event_id")
  WHERE "provider_event_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IDX_email_event_campaign_id"
  ON "email_event" ("campaign_id");
CREATE INDEX IF NOT EXISTS "IDX_email_event_template_version_id"
  ON "email_event" ("template_version_id");
