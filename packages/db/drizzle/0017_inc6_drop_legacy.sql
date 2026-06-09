-- INC6 step 3 (契约 §2.5): drop the legacy columns. Apply ONLY after the new web (Vercel) and
-- jobs (Trigger) deploys are live — older builds SELECT these columns explicitly via drizzle.
-- Surgical restore artifact: packages/db/backups/inc6-pre-contract-*.json (+ PITR).
-- channels.channel_id consumers and the channels table itself retire in the FINAL round, not here.
ALTER TABLE "channels" DROP COLUMN "competitors";
ALTER TABLE "poet_custom_topics" DROP COLUMN "duration_minutes";
ALTER TABLE "poet_scripts" DROP COLUMN "duration_minutes";
