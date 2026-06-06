ALTER TABLE "poet_custom_topics" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "poet_scripts" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
UPDATE "poet_custom_topics" SET "duration_seconds" = "duration_minutes" * 60 WHERE "duration_seconds" IS NULL AND "duration_minutes" IS NOT NULL;--> statement-breakpoint
UPDATE "poet_scripts" SET "duration_seconds" = "duration_minutes" * 60 WHERE "duration_seconds" IS NULL AND "duration_minutes" IS NOT NULL;