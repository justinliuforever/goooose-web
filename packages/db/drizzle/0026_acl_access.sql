-- ACL: user access status/role/plan/bonus + pre-approval + access requests.
-- Additive. Hand-written (journal drifted at 0014). Existing users backfilled to
-- 'approved' so shipping the gate does not lock out current beta testers.
ALTER TABLE "users" ADD COLUMN "access_status" text NOT NULL DEFAULT 'pending';
ALTER TABLE "users" ADD COLUMN "role" text NOT NULL DEFAULT 'member';
ALTER TABLE "users" ADD COLUMN "plan" text NOT NULL DEFAULT 'free';
ALTER TABLE "users" ADD COLUMN "bonus_balances" jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE "allowed_emails" (
  "email" text PRIMARY KEY,
  "note" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "access_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message" text NOT NULL,
  "contact" text,
  "status" text NOT NULL DEFAULT 'pending',
  "decided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

UPDATE "users" SET "access_status" = 'approved';
