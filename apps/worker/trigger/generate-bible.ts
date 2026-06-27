import { logger, metadata, task } from "@trigger.dev/sdk";
import { and, desc, eq } from "drizzle-orm";
import { generateText } from "ai";

import { channels, clerkVideos, pipelineRuns, poetBible, poetDriftEvents, projects, withRunDb } from "@singularity/db";
import { generateChannelBible } from "@singularity/shared/services/poet/bible";
import { llm } from "@singularity/shared/clients/llm";
import { safeText } from "@singularity/shared/utils";

type Payload = {
  channelId: string;
  runId: string;
  ideaText: string;
  name?: string;
  language?: "en" | "zh";
};


export const generateBible = task({
  id: "poet-generate-bible",
  maxDuration: 600,
  run: async (payload: Payload) => {
    const language = payload.language ?? "zh";
    return withRunDb(payload.runId, async (db) => {
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, payload.channelId))
        .limit(1);
      if (!channel) throw new Error(`channel ${payload.channelId} not found`);

      await db
        .update(pipelineRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(pipelineRuns.id, payload.runId));

      // Auto-derive description from channel name + sample video titles if empty.
      let resolvedDescription = channel.description?.trim() ?? "";
      if (!resolvedDescription) {
        const sampleVideos = await db
          .select({ title: clerkVideos.title })
          .from(clerkVideos)
          .where(eq(clerkVideos.channelId, channel.id))
          .orderBy(desc(clerkVideos.views))
          .limit(8);
        if (sampleVideos.length > 0) {
          await metadata.set("progress", {
            current: 0,
            total: 1,
            phase: "deriving channel description",
            detail: `从 ${sampleVideos.length} 个视频标题派生频道简介`,
          });
          const derivePrompt = `Channel name: "${channel.name}".\nTop video titles:\n${sampleVideos.map((v, i) => `${i + 1}. ${v.title}`).join("\n")}\n\nWrite a 2-3 sentence factual description of this channel's niche, format, and target audience. Plain text, no preamble.`;
          const derive = await generateText({
            model: llm("flash"),
            prompt: derivePrompt,
            temperature: 0.3,
            maxOutputTokens: 400,
            maxRetries: 2,
          });
          resolvedDescription = derive.text.trim() || channel.name;
          await db
            .update(channels)
            .set({ description: resolvedDescription })
            .where(eq(channels.id, channel.id));
          logger.info(`Auto-derived channel description: ${resolvedDescription.slice(0, 120)}…`);
        } else {
          resolvedDescription = channel.name;
        }
      }

      await metadata.set("progress", {
        current: 0,
        total: 1,
        phase: "writing bible",
        detail: "AI 生成频道圣经中…",
      });

      const bible = await generateChannelBible(
        {
          ideaText: payload.ideaText,
          channelDescription: resolvedDescription,
          language,
        },
        async (chars) => {
          await metadata.set("progress", {
            current: 0,
            total: 1,
            phase: "writing bible",
            detail: `AI 生成频道圣经中…已生成 ${chars} 字`,
          });
        },
      );

      const drifted = bible.driftWarning !== null;
      const cleanContent = safeText(bible.content) ?? "";
      if (!cleanContent) throw new Error("Bible generation returned empty content");

      // Never clobber an active bible (extras stay inactive for explicit switch); auto-activate
      // only when none is active yet — even a drifted first one, so the channel is never left empty.
      const [existingActive] = await db
        .select({ id: poetBible.id })
        .from(poetBible)
        .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
        .limit(1);
      const shouldActivate = !existingActive;

      const [inserted] = await db
        .insert(poetBible)
        .values({
          channelId: channel.id,
          ownAccountId: channel.id,
          name: payload.name ?? (bible.topicClaimed || "未命名"),
          content: cleanContent,
          sourceIdea: payload.ideaText,
          isActive: shouldActivate,
        })
        .returning();

      // Keep the project's hard pin in sync with the active Bible.
      if (shouldActivate && inserted) {
        await db
          .update(projects)
          .set({ activeBibleId: inserted.id, updatedAt: new Date() })
          .where(eq(projects.id, channel.id));
      }

      if (drifted && bible.driftWarning && inserted) {
        await db.insert(poetDriftEvents).values({
          channelId: channel.id,
          ownAccountId: channel.id,
          bibleId: inserted.id,
          reason: bible.driftWarning.reason,
          claimedTopic: bible.driftWarning.claimedTopic,
          humanMessage: bible.driftWarning.humanMessage,
        });
        logger.warn(`Bible drift: ${bible.driftWarning.reason}`, {
          topic: bible.driftWarning.claimedTopic,
        });
      }

      await db
        .update(pipelineRuns)
        .set({ status: "done", completedAt: new Date(), progress: 1, total: 1 })
        .where(eq(pipelineRuns.id, payload.runId));

      return {
        bibleId: inserted?.id ?? null,
        drifted,
        driftReason: bible.driftWarning?.reason ?? null,
        topicClaimed: bible.topicClaimed,
      };
    });
  },
});
