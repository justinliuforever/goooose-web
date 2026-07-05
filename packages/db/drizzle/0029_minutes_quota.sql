-- Quota model switch: single monthly minutes pool (bonus expires with the period),
-- login tracking for the admin user-detail view. Additive; contents_used /
-- generations_used / bonus_balances stay dormant.
ALTER TABLE "usage_counters" ADD COLUMN "minutes_used" integer NOT NULL DEFAULT 0;
ALTER TABLE "usage_counters" ADD COLUMN "bonus_minutes" integer NOT NULL DEFAULT 0;
ALTER TABLE "quota_adjustments" ADD COLUMN "minutes_delta" integer NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_seen_at" timestamp with time zone;

CREATE TABLE "login_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX "login_events_user_idx" ON "login_events" ("user_id", "created_at");
