CREATE TABLE "shopify_command" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_connector" (
	"shop_domain" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cursors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"last_sync_at" timestamp with time zone,
	"last_recovery_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_object" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_recovery" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"cart_key" text,
	"email" text,
	"customer_id" text,
	"state" text DEFAULT 'watching' NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_domain" text NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "shopify_command_ready" ON "shopify_command" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_object_source" ON "shopify_object" USING btree ("shop_domain","kind","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopify_recovery_source" ON "shopify_recovery" USING btree ("shop_domain","kind","source_key");--> statement-breakpoint
CREATE INDEX "shopify_recovery_ready" ON "shopify_recovery" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "shopify_recovery_email" ON "shopify_recovery" USING btree ("shop_domain","email");--> statement-breakpoint
CREATE INDEX "shopify_webhook_ready" ON "shopify_webhook" USING btree ("state","next_attempt_at");