CREATE TABLE "email_preference_link" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_email_preference_link_email" ON "email_preference_link" USING btree ("email");
--> statement-breakpoint
CREATE INDEX "IDX_email_preference_link_expires_at" ON "email_preference_link" USING btree ("expires_at");
