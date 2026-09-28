DO $$ BEGIN CREATE TYPE "signup_form_type" AS ENUM ('popup', 'flyout'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "signup_form_status" AS ENUM ('draft', 'published'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "signup_form" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "type" "signup_form_type" DEFAULT 'popup' NOT NULL,
  "status" "signup_form_status" DEFAULT 'draft' NOT NULL,
  "document" jsonb NOT NULL,
  "discount_flow_id" text,
  "submitted" integer DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "published_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "deleted_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "IDX_signup_form_deleted_at" ON "signup_form" ("deleted_at") WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "IDX_signup_form_status" ON "signup_form" ("status");
CREATE INDEX IF NOT EXISTS "IDX_signup_form_type" ON "signup_form" ("type");
CREATE INDEX IF NOT EXISTS "IDX_signup_form_status_type" ON "signup_form" ("status", "type");
