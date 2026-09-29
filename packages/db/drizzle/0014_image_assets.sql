CREATE TABLE "ermes_image_asset" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cloud_name" text NOT NULL,
	"public_id" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ermes_image_asset_source" ON "ermes_image_asset" USING btree ("cloud_name","public_id");--> statement-breakpoint
CREATE INDEX "ermes_image_asset_created" ON "ermes_image_asset" USING btree ("created_at","id");