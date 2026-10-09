CREATE TYPE "public"."thread_source_type" AS ENUM('url', 'text');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_key" text NOT NULL,
	"creator_name" text NOT NULL,
	"source_type" "thread_source_type" NOT NULL,
	"source_url" text,
	"note" text,
	"title" text,
	"site_name" text,
	"image_url" text,
	"content" text,
	"summary" text,
	"key_points" jsonb,
	"suggested_questions" jsonb,
	"status" "thread_status" NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "threads_creator_key_idx" ON "threads" USING btree ("creator_key");--> statement-breakpoint
CREATE INDEX "threads_created_at_idx" ON "threads" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);