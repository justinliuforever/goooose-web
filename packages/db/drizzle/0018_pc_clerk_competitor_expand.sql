-- P-C expand (设计文档 v2 §2.2): Clerk analyses may target a competitor_account.
-- Hand-written raw SQL (drizzle meta/journal drifted at 0014 — do NOT use drizzle-kit generate).
-- NOTE: step ② explicitly REVOKES INC6 §2.5's SET NOT NULL on clerk own_account_id —
-- 方案一决策 A requires SOP ownership by competitor source. Recorded architectural reversal.

-- ① ownership columns (clerk_sops has the column since 0012 but with SET NULL semantics
-- that would violate the one-owner CHECK on competitor deletion — rebuild as CASCADE)
ALTER TABLE "clerk_videos" ADD COLUMN "competitor_account_id" uuid;
ALTER TABLE "clerk_videos" ADD CONSTRAINT "clerk_videos_competitor_account_id_competitor_accounts_id_fk"
  FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "pipeline_runs" ADD COLUMN "competitor_account_id" uuid;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_competitor_account_id_competitor_accounts_id_fk"
  FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "clerk_sops" DROP CONSTRAINT "clerk_sops_competitor_account_id_competitor_accounts_id_fk";
ALTER TABLE "clerk_sops" ADD CONSTRAINT "clerk_sops_competitor_account_id_competitor_accounts_id_fk"
  FOREIGN KEY ("competitor_account_id") REFERENCES "public"."competitor_accounts"("id") ON DELETE cascade ON UPDATE no action;

-- ② relax own-side ownership (competitor rows carry NULLs here)
ALTER TABLE "clerk_videos" ALTER COLUMN "channel_id" DROP NOT NULL;
ALTER TABLE "clerk_videos" ALTER COLUMN "own_account_id" DROP NOT NULL;
ALTER TABLE "clerk_sops" ALTER COLUMN "channel_id" DROP NOT NULL;
ALTER TABLE "clerk_sops" ALTER COLUMN "own_account_id" DROP NOT NULL;
ALTER TABLE "pipeline_runs" ALTER COLUMN "channel_id" DROP NOT NULL;

-- ③ exactly-one-owner + own-side pairing (NOT VALID then VALIDATE — no full table lock;
-- all historical rows satisfy these, so VALIDATE is safe)
ALTER TABLE "clerk_videos" ADD CONSTRAINT "clerk_videos_one_owner" CHECK (
  num_nonnulls("own_account_id", "competitor_account_id") = 1
  AND ("own_account_id" IS NULL) = ("channel_id" IS NULL)
) NOT VALID;
ALTER TABLE "clerk_sops" ADD CONSTRAINT "clerk_sops_one_owner" CHECK (
  num_nonnulls("own_account_id", "competitor_account_id") = 1
  AND ("own_account_id" IS NULL) = ("channel_id" IS NULL)
) NOT VALID;
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_one_owner" CHECK (
  num_nonnulls("channel_id", "competitor_account_id") = 1
) NOT VALID;
ALTER TABLE "clerk_videos" VALIDATE CONSTRAINT "clerk_videos_one_owner";
ALTER TABLE "clerk_sops" VALIDATE CONSTRAINT "clerk_sops_one_owner";
ALTER TABLE "pipeline_runs" VALIDATE CONSTRAINT "pipeline_runs_one_owner";

-- ④ competitor-side dedup twins + lookup indexes (own-side uniques ignore NULL rows)
CREATE UNIQUE INDEX "clerk_videos_competitor_video_unique"
  ON "clerk_videos" ("competitor_account_id", "platform_video_id")
  WHERE "competitor_account_id" IS NOT NULL;
CREATE INDEX "clerk_videos_competitor_idx" ON "clerk_videos" ("competitor_account_id")
  WHERE "competitor_account_id" IS NOT NULL;
CREATE INDEX "clerk_sops_competitor_idx" ON "clerk_sops" ("competitor_account_id")
  WHERE "competitor_account_id" IS NOT NULL;
CREATE INDEX "pipeline_runs_competitor_status_idx"
  ON "pipeline_runs" ("competitor_account_id", "status")
  WHERE "competitor_account_id" IS NOT NULL;
