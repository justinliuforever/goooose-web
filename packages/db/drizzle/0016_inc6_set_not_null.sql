-- INC6 step 2 (former INC5e): owner columns SET NOT NULL. ALTER ... SET NOT NULL scans and
-- errors on any NULL row, so the null-precheck is inherent to the statement (no TOCTOU).
-- competitor_account_id columns stay nullable forever by design.
ALTER TABLE "clerk_videos" ALTER COLUMN "own_account_id" SET NOT NULL;
ALTER TABLE "clerk_sops" ALTER COLUMN "own_account_id" SET NOT NULL;
ALTER TABLE "poet_bible" ALTER COLUMN "own_account_id" SET NOT NULL;
ALTER TABLE "poet_drift_events" ALTER COLUMN "own_account_id" SET NOT NULL;
ALTER TABLE "muse_monitor_videos" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "muse_ideas" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "poet_custom_topics" ALTER COLUMN "project_id" SET NOT NULL;
ALTER TABLE "poet_scripts" ALTER COLUMN "project_id" SET NOT NULL;
