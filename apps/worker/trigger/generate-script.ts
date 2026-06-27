import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";

import {
  channels,
  clerkVideos,
  museIdeas,
  museMonitorVideos,
  pipelineRuns,
  poetCustomTopics,
  poetScripts,
  projects,
  resolveActiveBible,
  resolvePrimarySop,
  type CheckedFact,
  type CustomTopicReference,
  withRunDb,
} from "@singularity/db";
import { factCheckVerbatim } from "@singularity/shared/services/poet/fact-check";
import { humanizeChinese } from "@singularity/shared/services/poet/humanizer";
import {
  formatVerbatimFacts,
  type ScriptReference,
  writeScript,
} from "@singularity/shared/services/poet/script-writer";
import { computeTargetWordCount, isLongForm } from "@singularity/shared/schemas/poet";
import { safeText } from "@singularity/shared/utils";

type Payload = {
  channelId: string;
  runId: string;
  // Exactly one of these two must be set.
  ideaId?: string;
  customTopicId?: string;
  language?: "en" | "zh";
  durationSeconds?: number;
};


export const generateScript = task({
  id: "poet-generate-script",
  maxDuration: 3600,
  run: async (payload: Payload) => {
    const language = payload.language ?? "zh";
    return withRunDb(payload.runId, async (db) => {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);

      // Duration default source: project.id == channel.id during the expand phase.
      const [project] = await db
        .select({ targetDurationSeconds: projects.targetDurationSeconds })
        .from(projects)
        .where(eq(projects.id, channel.id))
        .limit(1);

      await db
        .update(pipelineRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      // total is conservative until duration/outline are known; corrected below + after outline.
      let total = 4;
      let step = 0;
      const setProgress = async (phase: string, detail: string) => {
        await metadata.set("progress", { current: step, total, phase, detail });
      };

      await setProgress("loading context", "加载圣经、SOP 与选题");

      if (!payload.ideaId === !payload.customTopicId) {
        throw new Error("Exactly one of ideaId or customTopicId must be provided");
      }

      let idea: {
        storyAngle: string;
        factsAndData: string;
        whySimilar: string;
        viralTrigger: string;
        sourceTitle: string;
        sourceChannel: string;
      };
      let references: ScriptReference[] = [];
      let verbatimFacts: string | null = null;
      let factChecks: CheckedFact[] | null = null;
      let museIdeaId: string | null = null;
      let customTopicIdFinal: string | null = null;
      let rowDurationSeconds: number | null = null;

      if (payload.ideaId) {
        const [ideaRow] = await db
          .select({
            id: museIdeas.id,
            channelId: museIdeas.channelId,
            storyAngle: museIdeas.storyAngle,
            factsAndData: museIdeas.factsAndData,
            whySimilar: museIdeas.whySimilar,
            viralTrigger: museIdeas.viralTrigger,
            sourceTitle: museMonitorVideos.title,
            sourceChannelName: museMonitorVideos.sourceChannelName,
            sourceTranscript: museMonitorVideos.transcript,
            sourceUrl: museMonitorVideos.url,
          })
          .from(museIdeas)
          .leftJoin(museMonitorVideos, eq(museMonitorVideos.id, museIdeas.sourceVideoId))
          .where(and(eq(museIdeas.id, payload.ideaId), eq(museIdeas.channelId, channel.id)))
          .limit(1);
        if (!ideaRow) throw new Error(`idea ${payload.ideaId} not found in this channel`);
        museIdeaId = ideaRow.id;
        idea = {
          storyAngle: ideaRow.storyAngle ?? "",
          factsAndData: ideaRow.factsAndData ?? "",
          whySimilar: ideaRow.whySimilar ?? "",
          viralTrigger: ideaRow.viralTrigger ?? "",
          sourceTitle: ideaRow.sourceTitle ?? "",
          sourceChannel: ideaRow.sourceChannelName ?? "",
        };
        if (ideaRow.sourceTranscript) {
          references = [
            {
              type: "youtube",
              title: ideaRow.sourceTitle ?? "Source video",
              url: ideaRow.sourceUrl ?? undefined,
              content: ideaRow.sourceTranscript,
            },
          ];
        } else {
          const topVideos = await db
            .select({
              title: clerkVideos.title,
              url: clerkVideos.url,
              transcript: clerkVideos.transcript,
            })
            .from(clerkVideos)
            .where(eq(clerkVideos.channelId, channel.id))
            .orderBy(desc(clerkVideos.views))
            .limit(2);
          references = topVideos
            .filter((v) => v.transcript && v.transcript.length > 0)
            .map((v) => ({
              type: "youtube",
              title: v.title,
              url: v.url,
              content: v.transcript!,
            }));
        }
        // Muse idea facts would otherwise reach the writer unchecked, and hedges
        // like "(needs verification)" don't survive into spoken copy — same
        // source-layer check custom topics get; conservative fallback never blocks.
        if (idea.factsAndData.trim()) {
          const checks = await factCheckVerbatim({
            verbatimFacts: idea.factsAndData,
            referenceTitles: [],
            language,
            logger: {
              info: (m) => logger.info(m),
              warn: (m) => logger.warn(m),
            },
          });
          const flagged = checks.filter((c) => c.status !== "verified").length;
          if (flagged > 0) {
            idea = { ...idea, factsAndData: formatVerbatimFacts(idea.factsAndData, checks) };
          }
          verbatimFacts = idea.factsAndData;
          factChecks = checks;
          logger.info(`idea fact-check: ${checks.length} facts, ${flagged} flagged`);
        }
      } else {
        const [topicRow] = await db
          .select()
          .from(poetCustomTopics)
          .where(
            and(
              eq(poetCustomTopics.id, payload.customTopicId!),
              eq(poetCustomTopics.channelId, channel.id),
            ),
          )
          .limit(1);
        if (!topicRow) {
          throw new Error(`custom topic ${payload.customTopicId} not found in this channel`);
        }
        if (topicRow.status !== "analyzed" && topicRow.status !== "scripted") {
          throw new Error("请先分析该自定义选题再开始写稿");
        }
        customTopicIdFinal = topicRow.id;
        rowDurationSeconds = topicRow.durationSeconds ?? null;
        idea = {
          storyAngle: topicRow.storyAngle ?? "",
          factsAndData: topicRow.factsAndData ?? "",
          whySimilar: topicRow.whySimilar ?? "",
          viralTrigger: topicRow.viralTrigger ?? "",
          sourceTitle: topicRow.topic,
          sourceChannel: "Custom topic",
        };
        verbatimFacts = topicRow.verbatimFacts;
        factChecks = topicRow.factChecks;
        const stored = (topicRow.references as CustomTopicReference[] | null) ?? [];
        references = stored
          .map((r): ScriptReference | null => {
            const content = r.text ?? "";
            if (!content.trim()) return null;
            return {
              type: r.kind,
              title: r.title ?? "Reference",
              url: r.url,
              content,
            };
          })
          .filter((r): r is ScriptReference => r !== null);
      }

      // Duration priority: explicit request > row-stored value > project default.
      const resolvedDuration =
        payload.durationSeconds ?? rowDurationSeconds ?? project?.targetDurationSeconds ?? null;
      const targetWordCount = computeTargetWordCount(resolvedDuration ?? undefined, language);
      const willGoLong = isLongForm(targetWordCount, language);
      total = willGoLong ? 4 : 3;

      const resolvedBible = await resolveActiveBible(db, channel.id);
      if (!resolvedBible) throw new Error("No active Channel Bible — generate one first");
      if (resolvedBible.viaFallback) {
        logger.warn(`Project ${channel.id} has no Bible pin; used channel active-bible fallback`);
      }
      const bible = resolvedBible.bible;

      const sop = await resolvePrimarySop(db, channel.id);
      const sopText = sop?.contentMd ?? "";
      if (!sopText) {
        logger.warn(
          `No Clerk SOP for channel ${channel.id} — script will follow Bible voice without retention scaffolding`,
        );
      }

      const lengthUnit = language === "zh" ? "字" : "词";
      step = 1;
      await setProgress(
        willGoLong ? "writing outline" : "writing script",
        willGoLong
          ? `AI 拆分长稿大纲（目标 ${targetWordCount} ${lengthUnit}）`
          : `AI 写稿中（目标 ${targetWordCount} ${lengthUnit}）`,
      );

      const draft = await writeScript(
        {
          idea,
          sopText,
          bibleText: bible.content,
          language,
          references,
          targetWordCount,
          verbatimFacts,
          factChecks,
        },
        {
          onOutlineDone: async (outline) => {
            // 1 load + 1 outline + N sections + (1 humanize if zh) + 1 save
            total = 2 + outline.sections.length + (language === "zh" ? 1 : 0) + 1;
            step = 2;
            await setProgress(
              `expanding section 1/${outline.sections.length}`,
              `共 ${outline.sections.length} 段，开始扩写`,
            );
          },
          onSectionStart: async ({ index, total: totalSections, marker }) => {
            step = 2 + index;
            await setProgress(
              `expanding section ${index + 1}/${totalSections}`,
              `扩写 ${marker}（第 ${index + 1}/${totalSections} 段）`,
            );
          },
          onSectionDone: async ({ index, total: totalSections, marker, chars }) => {
            logger.info(`[long_form] ${marker} done (${chars} chars, ${index + 1}/${totalSections})`);
          },
        },
      );

      let scriptText = safeText(draft.scriptText) ?? "";
      if (!scriptText) throw new Error("Script generation returned empty text");

      // Humanize only the short path. Long-form sections are already written in
      // spoken style + the de-translationese glossary, and a one-pass humanize of a
      // long script truncates (the guard then returns it unchanged) — a wasted call.
      if (language === "zh" && draft.path === "short") {
        step = total - 1;
        await setProgress("humanizing script", "改写为真人口语（约 1-2 分钟）");
        // Budget cap: the colloquial rewrite was the historical 2-3× short-form
        // inflator; over-budget rewrites fall back to the draft inside humanizeChinese.
        scriptText =
          (await humanizeChinese(scriptText, Math.round(targetWordCount * 1.25))).trim() ||
          scriptText;
      }

      step = total;
      await setProgress("saving script", "写入数据库");

      const wordCount =
        language === "zh" ? scriptText.length : scriptText.trim().split(/\s+/).length;
      const durationSeconds = resolvedDuration;

      const [scriptRow] = await db
        .insert(poetScripts)
        .values({
          channelId: channel.id,
          projectId: channel.id,
          ideaId: museIdeaId,
          customTopicId: customTopicIdFinal,
          bibleId: bible.id,
          sopId: sop?.id ?? null,
          scriptText: safeText(scriptText) ?? "",
          language,
          wordCount,
          durationSeconds,
          runId: payload.runId,
        })
        .returning();

      if (scriptRow && museIdeaId) {
        await db
          .update(museIdeas)
          .set({ scripted: true })
          .where(eq(museIdeas.id, museIdeaId));
      }
      if (scriptRow && customTopicIdFinal) {
        await db
          .update(poetCustomTopics)
          .set({ status: "scripted", updatedAt: new Date() })
          .where(eq(poetCustomTopics.id, customTopicIdFinal));
      }

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date(), progress: total, total })
        .where(eq(pipelineRuns.id, payload.runId));

      return {
        scriptId: scriptRow?.id ?? null,
        wordCount,
        targetWordCount,
        path: draft.path,
        humanized: language === "zh",
      };
    });
  },
});
