import { logger, metadata, task } from "@trigger.dev/sdk";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { jsonrepair } from "jsonrepair";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  channels,
  channelSeries,
  flushProxyPool,
  loadProxyPool,
  pipelineRuns,
  type SeriesVideoRef,
} from "@singularity/db";
import { llm } from "@singularity/shared/clients/llm";
import {
  buildSeriesDetectPrompt,
  type SeriesDetectResponse,
} from "@singularity/shared/prompts/clerk-series";
import { listChannelVideosYtdlp } from "@singularity/shared/clients/ytdlp";

type Payload = {
  channelId: string;
  runId: string;
  // How many recent videos to pull. Default 100 — yt-dlp flat-playlist handles it cheaply.
  videoCount?: number;
  language?: "en" | "zh";
};

function parseSeriesJson(raw: string): SeriesDetectResponse | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice) as SeriesDetectResponse;
  } catch {
    try {
      return JSON.parse(jsonrepair(slice)) as SeriesDetectResponse;
    } catch {
      return null;
    }
  }
}

export const detectChannelSeries = task({
  id: "clerk-detect-channel-series",
  maxDuration: 600,
  run: async (payload: Payload) => {
    const videoCount = payload.videoCount ?? 100;
    const language = payload.language ?? "zh";

    const client = postgres(process.env.DATABASE_URL!, { prepare: false });
    const db = drizzle(client);

    try {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);
      if (channel.platform !== "youtube") {
        throw new Error("series detect only supports YouTube channels currently");
      }

      await db
        .update(pipelineRuns)
        .set({ status: "running", total: 3 })
        .where(eq(pipelineRuns.id, payload.runId));

      const proxyPool = await loadProxyPool(db, { provider: "wealthproxies" });
      if (proxyPool.size === 0) throw new Error("proxy pool empty");

      await metadata.set("progress", {
        current: 0,
        total: 3,
        phase: "fetching channel videos",
        detail: `抓取最近 ${videoCount} 个视频元信息`,
      });

      const session = proxyPool.checkout();
      let videos;
      try {
        videos = await listChannelVideosYtdlp(channel.platformUrl, videoCount, session.url);
        proxyPool.reportOk(session, 5_000);
      } catch (err) {
        proxyPool.reportErr(session, (err as Error).message, "other");
        throw err;
      }

      logger.info(`Pulled ${videos.length} videos for series detection`);
      if (videos.length < 3) {
        throw new Error(`Only ${videos.length} videos found — need ≥ 3 to detect series`);
      }

      await metadata.set("progress", {
        current: 1,
        total: 3,
        phase: "clustering by AI",
        detail: "DeepSeek 按主题归类",
      });

      const prompt = buildSeriesDetectPrompt({
        channelName: channel.name,
        videos: videos.map((v) => ({
          title: v.title,
          duration_sec: v.duration_sec,
          views: v.views,
        })),
        language,
      });

      // DeepSeek Pro is a reasoning model — needs generous output budget so the
      // JSON arrives after the reasoning tokens. 6K cap leaves no room for output.
      const result = await generateText({
        model: llm("pro"),
        prompt,
        maxOutputTokens: 12000,
        temperature: 0.3,
        maxRetries: 2,
      });

      const parsed = parseSeriesJson(result.text);
      if (!parsed || !Array.isArray(parsed.series)) {
        throw new Error(
          `Series JSON parse failed. finish=${result.finishReason ?? "unknown"} len=${result.text.length} head=${result.text.slice(0, 300)}`,
        );
      }
      logger.info(`Detected ${parsed.series.length} series`);

      await metadata.set("progress", {
        current: 2,
        total: 3,
        phase: "saving to DB",
        detail: `写入 ${parsed.series.length} 个系列`,
      });

      // Replace prior detection for this channel (single canonical clustering per run).
      await db.delete(channelSeries).where(eq(channelSeries.channelId, channel.id));

      let insertedSeriesCount = 0;
      for (const s of parsed.series) {
        if (!s.name || !Array.isArray(s.video_indices)) continue;
        const sampleVideos: SeriesVideoRef[] = s.video_indices
          .map((idx) => videos[idx - 1])
          .filter((v): v is NonNullable<typeof v> => !!v)
          .slice(0, 12)
          .map((v) => ({
            video_id: v.video_id,
            title: v.title,
            duration_sec: v.duration_sec,
            views: v.views,
            published_at: v.published_at,
          }));
        if (sampleVideos.length === 0) continue;
        await db.insert(channelSeries).values({
          channelId: channel.id,
          name: s.name.slice(0, 80),
          description: s.description?.slice(0, 500) ?? null,
          videoCount: s.video_indices.length,
          sampleVideos,
        });
        insertedSeriesCount++;
      }

      const flushed = await flushProxyPool(db, proxyPool);
      logger.info(
        `Pool flushed: ${flushed.updatedSessions} touched, ${flushed.newlyDisabled} newly disabled`,
      );

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date(), progress: 3, total: 3 })
        .where(eq(pipelineRuns.id, payload.runId));

      return {
        videosScanned: videos.length,
        seriesDetected: insertedSeriesCount,
      };
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
