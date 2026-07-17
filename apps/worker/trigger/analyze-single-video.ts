import { logger, metadata, task } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";

import {
  channels,
  clerkSops,
  clerkVideos,
  competitorAccounts,
  pipelineRuns,
} from "@goooose/db";

import { withMeteredRunDb } from "../lib/metered-run";
import { userRunsQueue } from "../lib/queues";
import { redactUngrounded } from "@goooose/domain/services/grounding";
import { llm } from "@goooose/integrations/clients/llm";
import { safeText } from "@goooose/integrations/utils";
import { buildHottestSopPrompt } from "@goooose/prompts/clerk";
import { generateText } from "ai";

type Payload = {
  runId: string;
  userId?: string;
  // An already-analyzed clerk_videos row id — the SOP is built from its cached
  // transcript + analysis, so no re-fetch/ASR/vision and the channel SOPs are untouched.
  videoId: string;
  language?: "en" | "zh";
};

// Same compact distillation the channel hottest step feeds the prompt.
function summarizeAnalysis(v: typeof clerkVideos.$inferSelect): string {
  const fields: Array<[string, string | null]> = [
    ["Framework", v.framework],
    ["Opening hook", v.openingHook],
    ["Hooks throughout", v.hooksThroughout],
    ["Script structure", v.scriptStructure],
    ["Storytelling", v.storytellingFramework],
    ["Retention pattern", v.retentionPattern],
    ["Key takeaways", v.keyTakeaways],
  ];
  return fields
    .filter(([, val]) => val)
    .map(([k, val]) => `**${k}**: ${val}`)
    .join("\n\n");
}

export const analyzeSingleVideo = task({
  id: "clerk-analyze-single-video",
  queue: userRunsQueue,
  maxDuration: 600,
  run: async (payload: Payload) => {
    const language = payload.language ?? "zh";
    return withMeteredRunDb({ runId: payload.runId, userId: payload.userId, feature: "clerk-analyze-single-video" }, async (db) => {
      await db
        .update(pipelineRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      const setProgress = (current: number, total: number, phase: string, detail: string) =>
        metadata.set("progress", { current, total, phase, detail });

      await setProgress(0, 3, "loading video", "加载视频分析结果");

      const [video] = await db
        .select()
        .from(clerkVideos)
        .where(eq(clerkVideos.id, payload.videoId))
        .limit(1);
      if (!video) throw new Error(`video ${payload.videoId} not found`);
      // Image posts (XHS/Douyin) store the caption as "transcript" — not speech with timing,
      // so a [m:ss] beat-by-beat deep-dive would be fabricated. Single-video SOP is video-only.
      if (video.contentType === "xhs_image" || video.contentType === "douyin_image") {
        throw new Error("图文帖没有语音内容，不支持单条拆解 SOP");
      }
      if (!video.transcript || !video.transcript.trim()) {
        throw new Error("该视频没有字幕/转写，无法生成单条拆解 SOP");
      }

      // The analyzed account's display name (own channel or competitor) — the prompt's only
      // owner-specific field. Owner columns come straight off the video row.
      let channelName = video.sourceChannelName ?? "";
      if (video.competitorAccountId) {
        const [comp] = await db
          .select({ name: competitorAccounts.name, url: competitorAccounts.url })
          .from(competitorAccounts)
          .where(eq(competitorAccounts.id, video.competitorAccountId))
          .limit(1);
        channelName = comp?.name ?? comp?.url ?? channelName;
      } else if (video.channelId) {
        const [ch] = await db
          .select({ name: channels.name })
          .from(channels)
          .where(eq(channels.id, video.channelId))
          .limit(1);
        channelName = ch?.name ?? channelName;
      }

      await setProgress(1, 3, "generating sop", "深度拆解这条内容（约 2-4 分钟）");

      const prompt = buildHottestSopPrompt({
        channelName,
        title: video.title,
        views: video.views ?? null,
        durationSec: video.durationSec ?? 0,
        url: video.url,
        transcript: video.transcript,
        analysisSummary: summarizeAnalysis(video),
        commentsSummary: null,
        language,
      });

      const sopResult = await generateText({
        model: llm("pro"),
        prompt,
        maxOutputTokens: 16384,
        temperature: 0.4,
        maxRetries: 2,
      });
      const cleaned = safeText(sopResult.text);
      if (!cleaned) throw new Error("单条拆解返回为空，请重试");

      const grounded = await redactUngrounded({
        draft: cleaned,
        source: video.transcript,
        language,
        logger,
      });

      await setProgress(2, 3, "saving sop", "写入数据库");

      // Scoped upsert: replace this video's prior single_video SOP only (partial unique on
      // video_id+language). Never deletes by (owner, sop_type), so channel SOPs stay intact.
      await db
        .insert(clerkSops)
        .values({
          channelId: video.channelId,
          ownAccountId: video.ownAccountId,
          competitorAccountId: video.competitorAccountId,
          sopType: "single_video",
          videoId: video.id,
          language,
          contentMd: grounded,
          runId: payload.runId,
        })
        .onConflictDoUpdate({
          target: [clerkSops.videoId, clerkSops.language],
          targetWhere: sql`${clerkSops.sopType} = 'single_video' AND ${clerkSops.videoId} is not null`,
          set: {
            contentMd: grounded,
            runId: payload.runId,
            generatedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date(), progress: 3, total: 3 })
        .where(eq(pipelineRuns.id, payload.runId));

      logger.info(`single-video SOP done for ${video.title} (${language})`);
      return { videoId: video.id, language };
    });
  },
});
