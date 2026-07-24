-- Preventive indexes (additive). run_id scans run on every settlement; the ops monitor
-- filters runs by status + started_at. Cheap at current scale, avoids a future cliff.
CREATE INDEX "clerk_videos_run_id_idx" ON "clerk_videos" ("run_id");
CREATE INDEX "muse_monitor_videos_run_id_idx" ON "muse_monitor_videos" ("run_id");
CREATE INDEX "pipeline_runs_status_started_idx" ON "pipeline_runs" ("status", "started_at");
