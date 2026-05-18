import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  channels,
  clerkSops,
  clerkVideos,
  museIdeas,
  museMonitorVideos,
  pipelineRuns,
  poetBible,
  poetScripts,
} from "@singularity/db";
import { humanizeChinese } from "@singularity/shared/services/poet/humanizer";
import {
  type ScriptReference,
  writeScript,
} from "@singularity/shared/services/poet/script-writer";
import { computeTargetWordCount, isLongForm } from "@singularity/shared/schemas/poet";

type Payload = {
  channelId: string;
  runId: string;
  ideaId: string;
  language?: "en" | "zh";
  durationMinutes?: number;
};

function safeText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const cleaned = v.replace(/ /g, "");
  return cleaned === "" ? null : cleaned;
}

export const generateScript = task({
  id: "poet-generate-script",
  maxDuration: 3600,
  run: async (payload: Payload) => {
    const language = payload.language ?? "zh";
    const targetWordCount = computeTargetWordCount(payload.durationMinutes, language);
    const willGoLong = isLongForm(targetWordCount, language);
    const client = postgres(process.env.DATABASE_URL!, { prepare: false });
    const db = drizzle(client);

    try {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);

      await db
        .update(pipelineRuns)
        .set({ status: "running" })
        .where(eq(pipelineRuns.id, payload.runId));

      // total stays conservative until outline returns; we'll bump it once we
      // know the section count.
      let total = willGoLong ? 4 : 3;
      let step = 0;
      const setProgress = async (phase: string, detail: string) => {
        await metadata.set("progress", { current: step, total, phase, detail });
      };

      await setProgress("loading context", "加载圣经、SOP 与选题");

      const [ideaRow] = await db
        .select({
          id: museIdeas.id,
          channelId: museIdeas.channelId,
          storyAngle: museIdeas.storyAngle,
          factsAndData: museIdeas.factsAndData,
          whySimilar: museIdeas.whySimilar,
          viralTrigger: museIdeas.viralTrigger,
          scripted: museIdeas.scripted,
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

      const [bible] = await db
        .select()
        .from(poetBible)
        .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
        .limit(1);
      if (!bible) throw new Error("No active Channel Bible — generate one first");

      const [sop] = await db
        .select()
        .from(clerkSops)
        .where(and(eq(clerkSops.channelId, channel.id), eq(clerkSops.sopType, "ai_reference")))
        .orderBy(desc(clerkSops.generatedAt))
        .limit(1);
      const sopText = sop?.contentMd ?? "";
      if (!sopText) {
        logger.warn(
          `No Clerk SOP for channel ${channel.id} — script will follow Bible voice without retention scaffolding`,
        );
      }

      let references: ScriptReference[] = [];
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

      const idea = {
        storyAngle: ideaRow.storyAngle ?? "",
        factsAndData: ideaRow.factsAndData ?? "",
        whySimilar: ideaRow.whySimilar ?? "",
        viralTrigger: ideaRow.viralTrigger ?? "",
        sourceTitle: ideaRow.sourceTitle ?? "",
        sourceChannel: ideaRow.sourceChannelName ?? "",
      };

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

      if (language === "zh") {
        step = total - 1;
        await setProgress("humanizing script", "改写为真人口语（约 1-2 分钟）");
        scriptText = (await humanizeChinese(scriptText)).trim() || scriptText;
      }

      step = total;
      await setProgress("saving script", "写入数据库");

      const wordCount =
        language === "zh" ? scriptText.length : scriptText.trim().split(/\s+/).length;
      const durationMinutes = payload.durationMinutes ?? null;

      const [scriptRow] = await db
        .insert(poetScripts)
        .values({
          channelId: channel.id,
          ideaId: ideaRow.id,
          bibleId: bible.id,
          sopId: sop?.id ?? null,
          scriptText: safeText(scriptText) ?? "",
          language,
          wordCount,
          durationMinutes,
          runId: payload.runId,
        })
        .returning();

      if (scriptRow) {
        await db
          .update(museIdeas)
          .set({ scripted: true })
          .where(eq(museIdeas.id, ideaRow.id));
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
    } catch (err) {
      const message = (err as Error).message;
      logger.error(`Script run ${payload.runId} failed: ${message}`);
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
