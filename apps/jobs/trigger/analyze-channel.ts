import { logger, metadata, task } from "@trigger.dev/sdk";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { channels, clerkVideos, pipelineRuns } from "@singularity/db";
import { llm } from "@singularity/shared/clients/llm";
import { buildVideoAnalysisPrompt } from "@singularity/shared/prompts/clerk";
import { clerkAnalysisSchema, clerkAnalysisToDbRow } from "@singularity/shared/schemas/clerk";
import {
  getChannelVideos,
  getTranscript,
  getVideoInfo,
  resolveChannelId,
} from "@singularity/shared/clients/tikhub";

type Payload = {
  channelId: string; // UUID from channels table
  runId: string; // UUID from pipeline_runs (created by tRPC handler)
  limit?: number; // max videos to analyze, default 5
  language?: "en" | "zh";
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const analyzeChannel = task({
  id: "clerk-analyze-channel",
  maxDuration: 3600,
  run: async (payload: Payload) => {
    const limit = payload.limit ?? 5;
    const language = payload.language ?? "en";

    const client = postgres(process.env.DATABASE_URL!, { prepare: false });
    const db = drizzle(client);

    try {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) {
        throw new Error(`channel ${payload.channelId} not found`);
      }

      logger.info(`Analyzing channel: ${channel.name} (${channel.platformUrl})`);
      await db
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, payload.runId));
      await metadata.set("progress", { current: 0, total: 0, phase: "resolving channel" });

      let ytChannelId: string;
      try {
        ytChannelId = await resolveChannelId(channel.platformUrl);
      } catch (err) {
        throw new Error(
          `Could not resolve YouTube channel ID from "${channel.platformUrl}". ` +
            `Update the channel URL to a real handle page (e.g. https://www.youtube.com/@kai-w). ` +
            `Underlying error: ${(err as Error).message}`,
        );
      }
      logger.info(`Resolved YouTube channel id: ${ytChannelId}`);

      await metadata.set("progress", { current: 0, total: 0, phase: "fetching videos" });
      const videos = await getChannelVideos(ytChannelId);
      const selected = videos.slice(0, limit);
      logger.info(`Selected ${selected.length} videos (limit=${limit}, available=${videos.length})`);

      if (selected.length === 0) {
        throw new Error("No videos found on this channel");
      }

      await db
        .update(pipelineRuns)
        .set({ total: selected.length, progress: 0 })
        .where(eq(pipelineRuns.id, payload.runId));

      let analyzed = 0;
      let failed = 0;
      for (let i = 0; i < selected.length; i++) {
        const ref = selected[i]!;
        const videoId = ref.video_id;
        await metadata.set("progress", {
          current: i + 1,
          total: selected.length,
          phase: "analyzing video",
          title: ref.title,
        });

        try {
          const info = await getVideoInfo(videoId);
          const transcript = await getTranscript(videoId);

          const prompt = buildVideoAnalysisPrompt({
            title: info.title,
            views: info.views,
            durationSec: info.duration_sec,
            thumbnailUrl: info.thumbnail_url,
            transcript: transcript?.text ?? null,
            contentType: "video",
            language,
          });

          const result = await generateObject({
            model: llm("pro"),
            schema: clerkAnalysisSchema,
            prompt,
            maxRetries: 2,
          });

          const dbAnalysis = clerkAnalysisToDbRow(result.object);
          const upsert = {
            channelId: channel.id,
            platformVideoId: info.video_id,
            title: info.title,
            url: info.url,
            views: info.views || null,
            durationSec: info.duration_sec || null,
            thumbnailUrl: info.thumbnail_url || null,
            sourceChannelName: info.channel_name || null,
            sourceChannelId: info.channel_id || null,
            transcript: transcript?.text ?? null,
            ...dbAnalysis,
            analyzedAt: new Date(),
            runId: payload.runId,
          };

          await db
            .insert(clerkVideos)
            .values(upsert)
            .onConflictDoUpdate({
              target: [clerkVideos.channelId, clerkVideos.platformVideoId],
              set: upsert,
            });

          analyzed++;
          await db
            .update(pipelineRuns)
            .set({ progress: analyzed })
            .where(eq(pipelineRuns.id, payload.runId));
        } catch (err) {
          failed++;
          logger.warn(
            `Failed video ${videoId} (${ref.title}): ${(err as Error).message.slice(0, 200)}`,
          );
        }

        if (i < selected.length - 1) await sleep(1500);
      }

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      return { analyzed, failed, total: selected.length, channelName: channel.name };
    } catch (err) {
      const message = (err as Error).message;
      logger.error(`Run ${payload.runId} failed: ${message}`);
      await db
        .update(pipelineRuns)
        .set({ status: "failed", errorMessage: message, completedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));
      throw err;
    } finally {
      await client.end();
    }
  },
});
