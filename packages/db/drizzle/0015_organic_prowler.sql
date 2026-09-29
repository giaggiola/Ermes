CREATE TABLE "shopify_form_event" (
	"id" text PRIMARY KEY NOT NULL,
	"form_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
