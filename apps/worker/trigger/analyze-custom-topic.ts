import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";

import {
  channels,
  flushProxyPool,
  loadProxyPool,
  pipelineRuns,
  poetCustomTopics,
  resolveActiveBible,
  resolvePrimarySop,
  type CustomTopicReference,
  withRunDb,
} from "@singularity/db";
import {
  fetchReferences,
  type FetchedReference,
} from "@singularity/shared/clients/references";
import { analyzeTopic } from "@singularity/shared/services/poet/topic-analyzer";
import { safeText } from "@singularity/shared/utils";

type Payload = {
  channelId: string;
  runId: string;
  topicId: string;
  language?: "en" | "zh";
};


export const analyzeCustomTopic = task({
  id: "poet-analyze-custom-topic",
  maxDuration: 1800,
  run: async (payload: Payload) => {
    const language = payload.language ?? "zh";
    return withRunDb(payload.runId, async (db) => {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);

      const [topic] = await db
        .select()
        .from(poetCustomTopics)
        .where(
          and(
            eq(poetCustomTopics.id, payload.topicId),
            eq(poetCustomTopics.channelId, channel.id),
          ),
        )
        .limit(1);
      if (!topic) throw new Error(`custom topic ${payload.topicId} not found`);

      const resolvedBible = await resolveActiveBible(db, channel.id);
      if (!resolvedBible) throw new Error("请先生成并激活一份频道圣经");
      if (resolvedBible.viaFallback) {
        logger.warn(`Project ${channel.id} has no Bible pin; used channel active-bible fallback`);
      }
      const bible = resolvedBible.bible;

      const sop = await resolvePrimarySop(db, channel.id);
      const sopText = sop?.contentMd ?? "[No SOP reference available]";

      await db
        .update(pipelineRuns)
        .set({ status: "running", total: 2, startedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      const userRefs: CustomTopicReference[] = (topic.references as CustomTopicReference[]) ?? [];
      const needFetch = userRefs.filter((r) => r.kind !== "text");
      const hasYoutubeRef = userRefs.some((r) => r.kind === "youtube");
      await metadata.set("progress", {
        current: 0,
        total: 2,
        phase: "fetching references",
        detail: needFetch.length > 0 ? `抓取 ${needFetch.length} 个外部素材` : "无外部素材，跳过抓取",
      });

      const proxyPool = hasYoutubeRef
        ? await loadProxyPool(db, { provider: "wealthproxies" })
        : null;

      const fetched: FetchedReference[] = await fetchReferences(
        userRefs.map((r) => ({
          kind: r.kind,
          url: r.url,
          text: r.text,
          title: r.title,
        })),
        { pool: proxyPool ?? undefined },
      );

      if (proxyPool) {
        await flushProxyPool(db, proxyPool);
      }
      const failedCount = fetched.filter((r) => r.error).length;
      if (failedCount > 0) {
        logger.warn(`${failedCount}/${fetched.length} references failed to fetch`);
      }

      await metadata.set("progress", {
        current: 1,
        total: 2,
        phase: "analyzing topic",
        detail: "AI 拆解选题（约 30-60 秒）",
      });

      const analysis = await analyzeTopic({
        topic: topic.topic,
        references: fetched.map((f) => ({
          type: f.type,
          title: f.title,
          url: f.url,
          content: f.content,
          error: f.error,
        })),
        bibleText: bible.content,
        sopText,
        language,
      });

      // Persist fetched .content so the downstream script run doesn't refetch.
      const persistedRefs: CustomTopicReference[] = userRefs.map((original, idx) => {
        const got = fetched[idx];
        return {
          kind: original.kind,
          url: original.url,
          text: got?.content ?? original.text,
          title: got?.title ?? original.title,
        };
      });

      await db
        .update(poetCustomTopics)
        .set({
          status: "analyzed",
          projectId: channel.id,
          references: persistedRefs,
          storyAngle: safeText(analysis.storyAngle),
          factsAndData: safeText(analysis.factsAndData),
          verbatimFacts: safeText(analysis.verbatimFacts),
          factChecks: analysis.factChecks,
          whySimilar: safeText(analysis.whySimilar),
          viralTrigger: safeText(analysis.viralTrigger),
          bibleId: bible.id,
          sopId: sop?.id ?? null,
          language,
          updatedAt: new Date(),
        })
        .where(eq(poetCustomTopics.id, topic.id));

      await db
        .update(pipelineRuns)
        .set({
          status: "done",
          completedAt: new Date(),
          progress: 2,
          total: 2,
        })
        .where(eq(pipelineRuns.id, payload.runId));

      return {
        topicId: topic.id,
        refsFetched: fetched.length,
        refsFailed: failedCount,
      };
    });
  },
});
