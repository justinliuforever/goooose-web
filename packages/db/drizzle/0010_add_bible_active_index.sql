-- Dedupe any pre-existing duplicate-active bibles (keep most recent) before enforcing the invariant.
UPDATE "poet_bible" SET "is_active" = false WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "channel_id" ORDER BY "updated_at" DESC, "generated_at" DESC) AS rn
    FROM "poet_bible" WHERE "is_active"
  ) ranked WHERE rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "poet_bible_one_active_per_channel" ON "poet_bible" USING btree ("channel_id") WHERE "poet_bible"."is_active";