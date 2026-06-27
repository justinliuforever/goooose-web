-- Round 4 multi-project: a competitor video can now live under multiple projects of the same
-- account, so the channel-scoped unique blocks per-project rows. The project-scoped unique
-- (muse_monitor_videos_project_video_unique) remains the integrity guard.
-- ORDERING: apply ONLY AFTER the new worker (project-scoped onConflict) is deployed — the old
-- deployed worker's onConflict targets this constraint and will error if it's dropped first.
-- Hand-written raw SQL (journal drifted at 0014 — do NOT drizzle-kit generate).
ALTER TABLE "muse_monitor_videos" DROP CONSTRAINT IF EXISTS "muse_monitor_videos_channel_video_unique";
