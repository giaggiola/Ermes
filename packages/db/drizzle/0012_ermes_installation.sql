CREATE TABLE "ermes_admin" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ermes_admin_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ermes_installation" (
	"id" integer PRIMARY KEY NOT NULL,
	"merchant" jsonb,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"shop_domain" text,
	"shopify_verified_at" timestamp with time zone,
	"delivery_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ermes_installation_singleton" CHECK ("ermes_installation"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "ermes_login_attempt" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ermes_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ermes_session" ADD CONSTRAINT "ermes_session_admin_id_ermes_admin_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."ermes_admin"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ermes_session_expiry" ON "ermes_session" USING btree ("expires_at");
--> statement-breakpoint
INSERT INTO "ermes_installation" ("id") VALUES (1);
