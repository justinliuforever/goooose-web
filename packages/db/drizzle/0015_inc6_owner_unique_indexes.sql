-- INC6 step 1 (契约 §2.5): owner-keyed unique twins of the channel-scoped uniques.
-- During the expand phase owner == channel (D3 spine), so these are provably collision-free
-- (precheck: verify-inc6-contract.ts). Channel-scoped uniques stay until channel_id retires
-- in the final contract round — insert ON CONFLICT targets still reference them.
ALTER TABLE "clerk_videos" ADD CONSTRAINT "clerk_videos_owner_video_unique" UNIQUE ("own_account_id", "platform_video_id");
ALTER TABLE "muse_monitor_videos" ADD CONSTRAINT "muse_monitor_videos_project_video_unique" UNIQUE ("project_id", "platform_video_id");
