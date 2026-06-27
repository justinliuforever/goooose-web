import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";

import {
  channels,
  competitorAccounts,
  flushProxyPool,
  loadProxyPool,
  museIdeas,
  museMonitorVideos,
  pipelineRuns,
  projectCompetitors,
  withRunDb,
} from "@singularity/db";
import {
  likelyChineseText,
  renderTranscriptWithTimestamps,
  transcribeFromStreams,
  transcribeYoutubeVideo,
} from "@singularity/shared/clients/asr";
import { withProxyRetry, type ProxyPool } from "@singularity/shared/proxy";
import {
  getVideoMetadataYtdlp,
  listChannelVideos,
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
import { asPositiveNumber, parseDurationToSec, safeText, sleep } from "@singularity/shared/utils";

const ASR_MAX_DURATION_SEC = 60 * 60;
const DEFAULT_NUM_IDEAS = 5;

type Payload = {
  channelId: string;
  runId: string;
  maxVideosPerCompetitor?: number;
  numIdeasPerVideo?: number;
  language?: "en" | "zh";
  // Subset of bound competitor_accounts ids to monitor; omitted = all bound.
  competitorAccountIds?: string[];
  // XHS-only content filter; YouTube competitors are unaffected.
  xhsContentType?: "all" | "video" | "image";
};





export const monitorCompetitors = task({
  id: "muse-monitor-competitors",
  // Serial per-video pipeline (I/O + LLM bound); one audio buffer at a time fits medium-1x's 2GB.
  machine: { preset: "medium-1x" },
  // Cap concurrent runs so a burst of users can't exhaust the Trigger/Groq budget.
  queue: { concurrencyLimit: 6 },
  // 4h headroom for 10-20 videos with YouTube CDN throttle (Trigger.dev Hobby).
  maxDuration: 14400,
  run: async (payload: Payload) => {
    const maxVideosPerCompetitor = payload.maxVideosPerCompetitor ?? 10;
    const numIdeasPerVideo = payload.numIdeasPerVideo ?? DEFAULT_NUM_IDEAS;
    const language = payload.language ?? "zh";

    return withRunDb(payload.runId, async (db) => {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);

      // Competitors come exclusively from project_competitors (project.id == channel.id).
      const bound = await db
        .select({
          competitorAccountId: competitorAccounts.id,
          platform: competitorAccounts.platform,
          url: competitorAccounts.url,
        })
        .from(projectCompetitors)
        .innerJoin(
          competitorAccounts,
          eq(competitorAccounts.id, projectCompetitors.competitorAccountId),
        )
        .where(
          and(eq(projectCompetitors.projectId, channel.id), isNull(competitorAccounts.deletedAt)),
        );
      const idFilter =
        payload.competitorAccountIds && payload.competitorAccountIds.length > 0
          ? new Set(payload.competitorAccountIds)
          : null;
      const competitors: Array<{
        competitorAccountId: string | null;
        platform: "youtube" | "xhs";
        url: string;
      }> = bound
        .map((b) => ({
          competitorAccountId: b.competitorAccountId,
          platform: b.platform as "youtube" | "xhs",
          url: b.url,
        }))
        .filter((c) => !idFilter || (c.competitorAccountId && idFilter.has(c.competitorAccountId)));
      if (competitors.length === 0) {
        throw new Error("This channel has no competitors configured");
      }
      if (idFilter) {
        logger.info(`Competitor selection: ${competitors.length}/${bound.length} bound accounts`);
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
        .set({ status: "running", startedAt: new Date() })
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
        competitorAccountId: string | null;
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
            const xhsContentType = payload.xhsContentType ?? "all";
            let notes = await getXhsUserNotes(comp.url, maxVideosPerCompetitor);
            if (xhsContentType !== "all") {
              notes = notes.filter((n) =>
                xhsContentType === "video" ? n.type === "video" : n.type !== "video",
              );
            }
            for (const n of notes) {
              candidates.push({
                competitorIndex: ci,
                competitorUrl: comp.url,
                competitorAccountId: comp.competitorAccountId,
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
            const videos = await withProxyRetry(proxyPool, (session) =>
              listChannelVideos(comp.url, maxVideosPerCompetitor, session.url, logger),
            );
            for (const v of videos) {
              candidates.push({
                competitorIndex: ci,
                competitorUrl: comp.url,
                competitorAccountId: comp.competitorAccountId,
                platform: "youtube",
                videoId: v.video_id,
                title: v.title,
                viewCount: v.views,
                duration: v.duration_sec ? String(v.duration_sec) : undefined,
              });
            }
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

      // Stage-weighted live ETA: extrapolate remaining time from elapsed /
      // weighted-progress so the classify→idea-gen boundary doesn't reset. Classify (with ASR)
      // is ~65% of the timeline; serial loop so this is a sound estimator.
      const etaStart = Date.now();
      const etaField = (frac: number): { estSecondsRemaining?: number } => {
        const el = (Date.now() - etaStart) / 1000;
        return frac > 0.05 ? { estSecondsRemaining: Math.max(0, Math.round(el / frac - el)) } : {};
      };

      for (let i = 0; i < fresh.length; i++) {
        const ref = fresh[i]!;
        const stepBase = { current: i + 1, total: fresh.length };
        await metadata.set("progress", {
          ...stepBase,
          phase: "fetching video metadata",
          detail: `[${i + 1}/${fresh.length}] ${ref.title}`,
          ...etaField((0.65 * i) / fresh.length),
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
            // Metadata is enrichment only — degrade to null instead of failing the video.
            const info = await withProxyRetry(
              proxyPool,
              (session) => getVideoMetadataYtdlp(ref.videoId, session.url),
              { attempts: 3, okBytes: 10_000 },
            ).catch((err: Error) => {
              logger.warn(`yt-dlp metadata failed for ${ref.videoId}: ${err.message?.slice(0, 120)}`);
              return null;
            });

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
                qwenFirst: likelyChineseText(ref.title),
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
              projectId: channel.id,
              competitorAccountId: ref.competitorAccountId,
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
                projectId: channel.id,
                competitorAccountId: ref.competitorAccountId,
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
        // Use the same real-transcript gate as the main path (content type isn't
        // persisted, so apply the stricter video floor) — don't feed 50-199 char
        // garbage/partial ASR into idea generation.
        if (!o.transcript || !isRealTranscript(o.transcript, "video")) continue;
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
      let globalIdeaNumber = 0;
      if (relevantRows.length > 0) {
        await metadata.set("progress", {
          current: 0,
          total: relevantRows.length,
          phase: "generating ideas",
          detail: `共 ${relevantRows.length} 个相关视频，开始生成选题`,
          ...etaField(0.65),
        });

        for (let i = 0; i < relevantRows.length; i++) {
          const row = relevantRows[i]!;
          const stepBase = { current: i + 1, total: relevantRows.length };
          await metadata.set("progress", {
            ...stepBase,
            phase: "analyzing viral trigger",
            detail: `[${i + 1}/${relevantRows.length}] ${row.title} · 分析爆款触发因素`,
            ...etaField(0.65 + (0.35 * i) / relevantRows.length),
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
              ...etaField(0.65 + (0.35 * i) / relevantRows.length),
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
              ideasResult.ideas.map((idea) => ({
                channelId: channel.id,
                projectId: channel.id,
                sourceVideoId: row.monitorVideoId,
                ideaNumber: ++globalIdeaNumber,
                storyAngle: safeText(idea.story_angle),
                factsAndData: safeText(idea.facts_and_data),
                whySimilar: safeText(idea.why_similar),
                viralTrigger: safeText(idea.viral_trigger) ?? safeText(viralTrigger),
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
    });
  },
});
