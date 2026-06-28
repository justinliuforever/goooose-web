-- single_video SOPs: each is tied to one analyzed video, so it needs a video_id and its own
-- uniqueness (channel SOPs are one-per-type via app-level swap; per-video SOPs coexist).
-- Additive, nullable — channel SOPs keep video_id = NULL. Hand-written (journal drifted at 0014).
ALTER TABLE "clerk_sops" ADD COLUMN "video_id" uuid;
ALTER TABLE "clerk_sops" ADD CONSTRAINT "clerk_sops_video_id_clerk_videos_id_fk"
  FOREIGN KEY ("video_id") REFERENCES "public"."clerk_videos"("id")
  ON DELETE SET NULL ON UPDATE no action;

-- Replace-on-rerun for single_video without affecting channel SOPs: at most one single_video
-- SOP per (video_id, language). Partial → constrains only single_video rows; channel SOPs
-- (video_id NULL) are untouched, so the existing app-level swap is unchanged.
CREATE UNIQUE INDEX "clerk_sops_single_video_unique"
  ON "clerk_sops" ("video_id", "language")
  WHERE "sop_type" = 'single_video' AND "video_id" IS NOT NULL;
