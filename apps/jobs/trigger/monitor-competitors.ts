import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  channels,
  flushProxyPool,
  loadProxyPool,
  museIdeas,
  museMonitorVideos,
  pipelineRuns,
  type CompetitorRef,
} from "@singularity/db";
import {
  renderTranscriptWithTimestamps,
  transcribeFromStreams,
  transcribeYoutubeVideo,
} from "@singularity/shared/clients/asr";
import { classifyError, type ProxyPool } from "@singularity/shared/proxy";
import {
  getVideoMetadataYtdlp,
  listChannelVideosYtdlp,
} from "@singularity/shared/clients/ytdlp";
import {
  getXhsUserNotes,
  type XhsNote,
} from "@singularity/shared/clients/xhs";
import { isRealTranscript } from "@singularity/shared/schemas/muse";
import {
  analyzeViralTrigger,
  classifyVideo,
  generateIdeas,
} from "@singularity/shared/services/muse";

const ASR_MAX_DURATION_SEC = 60 * 60;
const DEFAULT_NUM_IDEAS = 5;

type Payload = {
  channelId: string;
  runId: string;
  maxVideosPerCompetitor?: number;
  numIdeasPerVideo?: number;
  language?: "en" | "zh";
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function asPositiveNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function safeText(v: string | null | undefined): string | null {
  if (v == null) return null;
  // Strip NULL bytes — DeepSeek occasionally emits U+0000 which Postgres rejects.
  const cleaned = v.replace(/\u0000/g, "");
  return cleaned === "" ? null : cleaned;
}

function parseDurationToSec(text: string | number | undefined): number {
  if (text == null || text === "") return 0;
  if (typeof text === "number") return text;
  const parts = text.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

export const monitorCompetitors = task({
  id: "muse-monitor-competitors",
  // 4h headroom for 10-20 videos with YouTube CDN throttle (Trigger.dev Hobby).
  maxDuration: 14400,
  run: async (payload: Payload) => {
    const maxVideosPerCompetitor = payload.maxVideosPerCompetitor ?? 10;
    const numIdeasPerVideo = payload.numIdeasPerVideo ?? DEFAULT_NUM_IDEAS;
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

      const competitors = (channel.competitors ?? []) as CompetitorRef[];
      if (competitors.length === 0) {
        throw new Error("This channel has no competitors configured");
      }

      // Muse touches both XHS and YouTube competitors; pool is YouTube-only.
      const hasYoutubeCompetitor = competitors.some((c) => c.platform === "youtube");
      let proxyPool: ProxyPool | null = null;
      if (hasYoutubeCompetitor) {
        proxyPool = await loadProxyPool(db, { provider: "wealthproxies" });
        logger.info(
          `Loaded proxy pool: ${proxyPool.size} sessions (${proxyPool.aliveCount} alive)`,
        );
      }

      const channelDescription = channel.description ?? channel.name;

      await db
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, payload.runId));
      await metadata.set("progress", {
        current: 0,
        total: competitors.length,
        phase: "resolving competitors",
        detail: `共 ${competitors.length} 个对标频道`,
      });

      type Candidate = {
        competitorIndex: number;
        competitorUrl: string;
        platform: "youtube" | "xhs";
        videoId: string;
        title: string;
        viewCount?: number;
        duration?: string;
        xhsNote?: XhsNote;
      };
      const candidates: Candidate[] = [];

      for (let ci = 0; ci < competitors.length; ci++) {
        const comp = competitors[ci]!;
        await metadata.set("progress", {
          current: ci + 1,
          total: competitors.length,
          phase: "fetching competitor videos",
          detail: `[${ci + 1}/${competitors.length}] ${comp.url}`,
        });
        try {
          if (comp.platform === "xhs") {
            const notes = await getXhsUserNotes(comp.url, maxVideosPerCompetitor);
            for (const n of notes) {
              candidates.push({
                competitorIndex: ci,
                competitorUrl: comp.url,
                platform: "xhs",
                videoId: n.noteId,
                title: n.title,
                xhsNote: n,
              });
            }
          } else {
            if (!proxyPool) {
              logger.warn(`Competitor ${comp.url}: YouTube path needs proxyPool — skipping`);
              continue;
            }
            const scoutAttempts = 4;
            let listed = false;
            for (let attempt = 1; attempt <= scoutAttempts; attempt++) {
              const session = proxyPool.checkout();
              try {
                const videos = await listChannelVideosYtdlp(
                  comp.url,
                  maxVideosPerCompetitor,
                  session.url,
                );
                proxyPool.reportOk(session, 5_000);
                for (const v of videos) {
                  candidates.push({
                    competitorIndex: ci,
                    competitorUrl: comp.url,
                    platform: "youtube",
                    videoId: v.video_id,
                    title: v.title,
                    viewCount: v.views,
                    duration: v.duration_sec ? String(v.duration_sec) : undefined,
                  });
                }
                listed = true;
                break;
              } catch (err) {
                const kind = classifyError(err, (err as Error & { status?: number }).status);
                proxyPool.reportErr(session, (err as Error).message, kind);
                if (attempt < scoutAttempts && (kind === "bot_check" || kind === "consecutive_403")) {
                  continue;
                }
                throw err;
              }
            }
            if (!listed) continue;
          }
        } catch (err) {
          logger.warn(`Competitor ${comp.url} failed: ${(err as Error).message}`);
        }
        await sleep(1000);
      }

      const existing = candidates.length === 0
        ? []
        : await db
            .select({ platformVideoId: museMonitorVideos.platformVideoId })
            .from(museMonitorVideos)
            .where(
              and(
                eq(museMonitorVideos.channelId, channel.id),
                inArray(
                  museMonitorVideos.platformVideoId,
                  candidates.map((c) => c.videoId),
                ),
              ),
            );
      const seen = new Set(existing.map((e) => e.platformVideoId));
      const fresh = candidates.filter((c) => !seen.has(c.videoId));

      logger.info(
        `Found ${candidates.length} candidate videos across ${competitors.length} competitors; ${fresh.length} are new`,
      );

      await db
        .update(pipelineRuns)
        .set({ total: fresh.length, progress: 0 })
        .where(eq(pipelineRuns.id, payload.runId));

      let classified = 0;
      let relevant = 0;
      let skippedShortTranscript = 0;
      const relevantRows: Array<{
        monitorVideoId: string;
        title: string;
        sourceChannelName: string | null;
        views: number;
        durationSec: number;
        transcript: string;
      }> = [];

      for (let i = 0; i < fresh.length; i++) {
        const ref = fresh[i]!;
        const stepBase = { current: i + 1, total: fresh.length };
        await metadata.set("progress", {
          ...stepBase,
          phase: "fetching video metadata",
          detail: `[${i + 1}/${fresh.length}] ${ref.title}`,
        });

        try {
          let title: string;
          let views: number;
          let durationSec: number;
          let url: string;
          let sourceChannelName: string | null;
          let finalTranscript: string | null = null;
          let contentType: "video" | "xhs_video" | "xhs_image" = "video";

          if (ref.platform === "xhs") {
            const note = ref.xhsNote!;
            contentType = note.type === "video" ? "xhs_video" : "xhs_image";
            title = note.title || ref.title || "(untitled)";
            views = note.engagementScore;
            durationSec = note.durationSec ?? 0;
            url = note.noteUrl;
            sourceChannelName = note.channelName || null;

            const titleAndDesc = [note.title, note.desc]
              .filter((s) => s.trim().length > 0)
              .join("\n\n");

            if (
              note.type === "video" &&
              note.videoStreams.length > 0 &&
              note.durationSec &&
              note.durationSec <= ASR_MAX_DURATION_SEC
            ) {
              await metadata.set("progress", {
                ...stepBase,
                phase: "transcribing audio",
                detail: `[${i + 1}/${fresh.length}] ${note.title} · XHS 音频转写中`,
              });
              const asr = await transcribeFromStreams(
                note.videoStreams.map((s) => ({
                  url: s.masterUrl,
                  mimeType: "video/mp4",
                  sizeHint: s.size,
                  label: `${s.codec} ${s.width}x${s.height}`,
                })),
                {
                  logger,
                  durationSec: note.durationSec ?? undefined,
                  tag: `XHS ${note.noteId}`,
                },
              );
              finalTranscript = asr
                ? `${titleAndDesc}\n\n[Audio Transcript]\n${asr.text}`.trim()
                : titleAndDesc || null;
            } else {
              finalTranscript = titleAndDesc || null;
            }
          } else {
            if (!proxyPool) {
              throw new Error("YouTube path requires proxyPool — not loaded");
            }
            let info: Awaited<ReturnType<typeof getVideoMetadataYtdlp>> | null = null;
            const metaAttempts = 3;
            for (let attempt = 1; attempt <= metaAttempts; attempt++) {
              const metaSession = proxyPool.checkout();
              try {
                info = await getVideoMetadataYtdlp(ref.videoId, metaSession.url);
                proxyPool.reportOk(metaSession, 10_000);
                break;
              } catch (err) {
                const kind = classifyError(err, (err as Error & { status?: number }).status);
                proxyPool.reportErr(metaSession, (err as Error).message, kind);
                if (attempt < metaAttempts && (kind === "bot_check" || kind === "consecutive_403")) {
                  continue;
                }
                logger.warn(`yt-dlp metadata failed for ${ref.videoId}: ${(err as Error).message?.slice(0, 120)}`);
                break;
              }
            }

            const candidateDuration =
              asPositiveNumber(info?.duration_sec ?? null) ??
              asPositiveNumber(parseDurationToSec(ref.duration)) ??
              0;
            if (candidateDuration === 0 || candidateDuration <= ASR_MAX_DURATION_SEC) {
              await metadata.set("progress", {
                ...stepBase,
                phase: "transcribing audio",
                detail: `[${i + 1}/${fresh.length}] ${ref.title} · 抓字幕或音频转写中`,
              });
              const asr = await transcribeYoutubeVideo(ref.videoId, proxyPool, {
                logger,
                durationSec: candidateDuration || undefined,
              });
              if (asr) {
                finalTranscript = renderTranscriptWithTimestamps(asr.text, asr.words);
              }
            }

            title = safeText(info?.title ?? null) ?? safeText(ref.title) ?? "(untitled)";
            views = asPositiveNumber(info?.views ?? null) ?? asPositiveNumber(ref.viewCount) ?? 0;
            durationSec = candidateDuration;
            url = safeText(info?.url ?? null) ?? `https://www.youtube.com/watch?v=${ref.videoId}`;
            sourceChannelName = safeText(info?.channel_name ?? null) ?? null;
          }

          await metadata.set("progress", {
            ...stepBase,
            phase: "classifying video",
            detail: `[${i + 1}/${fresh.length}] ${ref.title} · AI 分类中`,
          });
          const cls = await classifyVideo({
            channelDescription,
            title,
            channelName: sourceChannelName ?? "(unknown)",
            views,
            durationSec,
            transcript: finalTranscript,
            language,
          });

          const [inserted] = await db
            .insert(museMonitorVideos)
            .values({
              channelId: channel.id,
              platformVideoId: ref.videoId,
              title,
              url,
              sourceChannelName,
              durationSec: durationSec || null,
              transcript: safeText(finalTranscript),
              relevant: cls.relevant,
              topicClassification: safeText(cls.topic_classification),
              rejectionReason: safeText(cls.rejection_reason),
              runId: payload.runId,
            })
            .onConflictDoUpdate({
              target: [museMonitorVideos.channelId, museMonitorVideos.platformVideoId],
              set: {
                relevant: cls.relevant,
                topicClassification: safeText(cls.topic_classification),
                rejectionReason: safeText(cls.rejection_reason),
                transcript: safeText(finalTranscript),
                runId: payload.runId,
              },
            })
            .returning({ id: museMonitorVideos.id });

          classified++;
          if (cls.relevant && inserted) {
            relevant++;
            if (finalTranscript && isRealTranscript(finalTranscript, contentType)) {
              relevantRows.push({
                monitorVideoId: inserted.id,
                title,
                sourceChannelName,
                views,
                durationSec,
                transcript: finalTranscript,
              });
            } else {
              // Classifier said relevant but transcript is missing or too short;
              // viral-trigger + idea gen need real content, so we can't proceed.
              skippedShortTranscript++;
              logger.warn(
                `Video ${ref.videoId} ("${title}") marked relevant but transcript ${
                  finalTranscript ? `only ${finalTranscript.length} chars` : "missing"
                } — skipping idea gen`,
              );
            }
          }

          await db
            .update(pipelineRuns)
            .set({ progress: classified })
            .where(eq(pipelineRuns.id, payload.runId));
        } catch (err) {
          logger.error(`Video ${ref.videoId} failed`, {
            message: (err as Error).message?.slice(0, 500),
          });
        }
        if (i < fresh.length - 1) await sleep(1500);
      }

      // Recovery: pull DB rows that are relevant but never got ideas (prior
      // run killed by MAX_DURATION_EXCEEDED before idea-gen).
      const alreadyIdeated = await db
        .select({ id: museIdeas.sourceVideoId })
        .from(museIdeas)
        .where(eq(museIdeas.channelId, channel.id));
      const ideatedIds = alreadyIdeated
        .map((r) => r.id)
        .filter((id): id is string => id !== null);
      const orphans = await db
        .select({
          monitorVideoId: museMonitorVideos.id,
          title: museMonitorVideos.title,
          sourceChannelName: museMonitorVideos.sourceChannelName,
          durationSec: museMonitorVideos.durationSec,
          transcript: museMonitorVideos.transcript,
        })
        .from(museMonitorVideos)
        .where(
          and(
            eq(museMonitorVideos.channelId, channel.id),
            eq(museMonitorVideos.relevant, true),
            ideatedIds.length > 0
              ? notInArray(museMonitorVideos.id, ideatedIds)
              : undefined,
          ),
        );
      const inMemoryIds = new Set(relevantRows.map((r) => r.monitorVideoId));
      for (const o of orphans) {
        if (inMemoryIds.has(o.monitorVideoId)) continue;
        if (!o.transcript || o.transcript.trim().length < 50) continue;
        relevantRows.push({
          monitorVideoId: o.monitorVideoId,
          title: o.title,
          sourceChannelName: o.sourceChannelName,
          // views isn't persisted; prompts tolerate 0 on recovery path.
          views: 0,
          durationSec: o.durationSec ?? 0,
          transcript: o.transcript,
        });
      }
      if (orphans.length > 0) {
        logger.info(
          `Recovered ${orphans.length} orphan relevant videos missing ideas from prior runs`,
        );
      }

      let ideasGenerated = 0;
      if (relevantRows.length > 0) {
        await metadata.set("progress", {
          current: 0,
          total: relevantRows.length,
          phase: "generating ideas",
          detail: `共 ${relevantRows.length} 个相关视频，开始生成选题`,
        });

        for (let i = 0; i < relevantRows.length; i++) {
          const row = relevantRows[i]!;
          const stepBase = { current: i + 1, total: relevantRows.length };
          await metadata.set("progress", {
            ...stepBase,
            phase: "analyzing viral trigger",
            detail: `[${i + 1}/${relevantRows.length}] ${row.title} · 分析爆款触发因素`,
          });
          try {
            const viralTrigger = await analyzeViralTrigger({
              channelDescription,
              title: row.title,
              channelName: row.sourceChannelName ?? "(unknown)",
              views: row.views,
              durationSec: row.durationSec,
              transcript: row.transcript,
              language,
            });

            if (!viralTrigger) {
              logger.warn(`Empty viral trigger for ${row.title}; skipping idea generation`);
              continue;
            }

            await metadata.set("progress", {
              ...stepBase,
              phase: "generating ideas",
              detail: `[${i + 1}/${relevantRows.length}] ${row.title} · 生成 ${numIdeasPerVideo} 个选题`,
            });
            const ideasResult = await generateIdeas({
              channelDescription,
              title: row.title,
              channelName: row.sourceChannelName ?? "(unknown)",
              views: row.views,
              viralTrigger,
              numIdeas: numIdeasPerVideo,
              language,
            });

            if (ideasResult.ideas.length === 0) {
              logger.warn(
                `No ideas parsed for "${row.title}" — raw sample: ${ideasResult.rawSample ?? "(none)"} | validation: ${ideasResult.parseErrorSample ?? "(none)"}`,
              );
              continue;
            }

            await db.insert(museIdeas).values(
              ideasResult.ideas.map((idea, ix) => ({
                channelId: channel.id,
                sourceVideoId: row.monitorVideoId,
                ideaNumber: ix + 1,
                storyAngle: safeText(idea.story_angle),
                factsAndData: safeText(idea.facts_and_data),
                whySimilar: safeText(idea.why_similar),
                viralTrigger: safeText(viralTrigger),
                coverConcept: safeText(idea.cover_concept),
                suggestedHookType: safeText(idea.suggested_hook_type),
                riskFactors: safeText(idea.risk_factors),
                runId: payload.runId,
              })),
            ).onConflictDoNothing();
            ideasGenerated += ideasResult.ideas.length;
          } catch (err) {
            logger.error(`Idea generation failed for ${row.title}`, {
              message: (err as Error).message?.slice(0, 500),
            });
          }
          if (i < relevantRows.length - 1) await sleep(1500);
        }
      }

      if (proxyPool) {
        const flushed = await flushProxyPool(db, proxyPool);
        const stats = proxyPool.stats();
        logger.info(
          `Pool flushed: ${flushed.updatedSessions} sessions touched, ${flushed.newlyDisabled} newly disabled. ` +
            `alive=${stats.alive}/${stats.total} bytes=${JSON.stringify(stats.bytesByProvider)} ok=${JSON.stringify(stats.okByProvider)} err=${JSON.stringify(stats.errByProvider)}`,
        );
      }

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      return {
        classified,
        relevant,
        skippedShortTranscript,
        ideasGenerated,
        eligibleForIdeas: relevantRows.length,
        totalCandidates: candidates.length,
        newCandidates: fresh.length,
        competitors: competitors.length,
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
