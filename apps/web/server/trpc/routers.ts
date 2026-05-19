import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auth, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

import {
  channels,
  clerkSops,
  museIdeas,
  pipelineRuns,
  poetBible,
  poetCustomTopics,
  poetScripts,
} from "@singularity/db";

import { db } from "@/lib/db";
import { protectedProcedure, router } from "./init";
import {
  createChannelInput,
  deleteChannelInput,
  regenerateSlugInput,
  updateChannelInput,
} from "./schemas/channels";
import { deleteSopInput, runStatusInput, startAnalysisInput } from "./schemas/clerk";
import { approveIdeaInput, startMonitorInput } from "./schemas/muse";
import {
  analyzeCustomTopicInput,
  createCustomTopicInput,
  deleteBibleInput,
  deleteCustomTopicInput,
  deleteScriptInput,
  generateBibleInput,
  generateScriptFromCustomTopicInput,
  generateScriptInput,
  switchActiveBibleInput,
  updateBibleInput,
  updateCustomTopicInput,
} from "./schemas/poet";

function slugify(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  if (ascii.length > 0) return ascii;
  // ASCII-stripped result was empty (e.g. pure-Chinese name) — generate a short
  // unique-ish slug instead of falling back to a colliding "channel".
  return `ch-${Math.random().toString(36).slice(2, 8)}`;
}

async function assertNoActiveRun(channelId: string, agent: "clerk" | "muse" | "poet") {
  const [active] = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(
      and(
        eq(pipelineRuns.channelId, channelId),
        eq(pipelineRuns.agent, agent),
        inArray(pipelineRuns.status, ["pending", "running"]),
      ),
    )
    .limit(1);
  if (active) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "该频道当前已有运行中的任务，请等其完成后再启动",
    });
  }
}

async function uniqueSlug(userId: string, base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await db
      .select({ id: channels.id })
      .from(channels)
      .where(and(eq(channels.userId, userId), eq(channels.slug, candidate)))
      .limit(1);
    if (existing.length === 0) return candidate;
    suffix++;
    candidate = `${base}-${suffix}`;
  }
}

export const appRouter = router({
  channels: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db
        .select()
        .from(channels)
        .where(eq(channels.userId, ctx.user.id))
        .orderBy(desc(channels.createdAt));
    }),

    bySlug: protectedProcedure
      .input(z.object({ slug: z.string().min(1) }))
      .query(async ({ ctx, input }) => {
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.userId, ctx.user.id), eq(channels.slug, input.slug)))
          .limit(1);
        return channel ?? null;
      }),

    create: protectedProcedure
      .input(createChannelInput)
      .mutation(async ({ ctx, input }) => {
        const slug = await uniqueSlug(ctx.user.id, slugify(input.name));
        const [created] = await db
          .insert(channels)
          .values({
            userId: ctx.user.id,
            name: input.name,
            slug,
            platform: input.platform,
            platformUrl: input.platformUrl,
            description: input.description ?? null,
          })
          .returning();
        return created!;
      }),

    update: protectedProcedure
      .input(updateChannelInput)
      .mutation(async ({ ctx, input }) => {
        const { id, ...patch } = input;
        const [updated] = await db
          .update(channels)
          .set({
            name: patch.name,
            platform: patch.platform,
            platformUrl: patch.platformUrl,
            description: patch.description ?? null,
            competitors: patch.competitors ?? undefined,
            updatedAt: new Date(),
          })
          .where(and(eq(channels.id, id), eq(channels.userId, ctx.user.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    delete: protectedProcedure
      .input(deleteChannelInput)
      .mutation(async ({ ctx, input }) => {
        const [deleted] = await db
          .delete(channels)
          .where(and(eq(channels.id, input.id), eq(channels.userId, ctx.user.id)))
          .returning({ id: channels.id });
        return { id: deleted?.id ?? null };
      }),

    regenerateSlug: protectedProcedure
      .input(regenerateSlugInput)
      .mutation(async ({ ctx, input }) => {
        const [existing] = await db
          .select({ name: channels.name })
          .from(channels)
          .where(and(eq(channels.id, input.id), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        const fresh = await uniqueSlug(ctx.user.id, slugify(existing.name));
        const [updated] = await db
          .update(channels)
          .set({ slug: fresh, updatedAt: new Date() })
          .where(and(eq(channels.id, input.id), eq(channels.userId, ctx.user.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        return updated;
      }),
  }),

  clerk: router({
    startAnalysis: protectedProcedure
      .input(startAnalysisInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });

        await assertNoActiveRun(channel.id, "clerk");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "clerk",
            command: "clerk-analyze-channel",
            status: "pending",
            configJson: {
              limit: input.limit,
              language: input.language,
              mode: input.mode,
              source: input.source,
              videoIds: input.videoIds,
            },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("clerk-analyze-channel", {
          channelId: channel.id,
          runId: run.id,
          limit: input.limit,
          language: input.language,
          mode: input.mode,
          source: input.source,
          videoIds: input.videoIds,
        });

        await db
          .update(pipelineRuns)
          .set({
            configJson: {
              limit: input.limit,
              language: input.language,
              triggerRunId: handle.id,
            },
          })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),

    // Reissues a scoped token so the client can re-attach useRealtimeRun after a page refresh.
    activeRun: protectedProcedure
      .input(z.object({ channelId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [active] = await db
          .select({
            id: pipelineRuns.id,
            configJson: pipelineRuns.configJson,
          })
          .from(pipelineRuns)
          .innerJoin(channels, eq(channels.id, pipelineRuns.channelId))
          .where(
            and(
              eq(pipelineRuns.channelId, input.channelId),
              eq(channels.userId, ctx.user.id),
              inArray(pipelineRuns.status, ["pending", "running"]),
            ),
          )
          .orderBy(desc(pipelineRuns.startedAt))
          .limit(1);

        if (!active) return null;
        const triggerRunId = (active.configJson as { triggerRunId?: string } | null)
          ?.triggerRunId;
        if (!triggerRunId) return null;

        const token = await auth.createPublicToken({
          scopes: { read: { runs: [triggerRunId] } },
          expirationTime: "1h",
        });

        return {
          runId: active.id,
          triggerRunId,
          publicAccessToken: token,
        };
      }),

    runStatus: protectedProcedure
      .input(runStatusInput)
      .query(async ({ ctx, input }) => {
        const [run] = await db
          .select({
            id: pipelineRuns.id,
            channelId: pipelineRuns.channelId,
            agent: pipelineRuns.agent,
            status: pipelineRuns.status,
            progress: pipelineRuns.progress,
            total: pipelineRuns.total,
            startedAt: pipelineRuns.startedAt,
            completedAt: pipelineRuns.completedAt,
            errorMessage: pipelineRuns.errorMessage,
            configJson: pipelineRuns.configJson,
          })
          .from(pipelineRuns)
          .innerJoin(channels, eq(channels.id, pipelineRuns.channelId))
          .where(and(eq(pipelineRuns.id, input.runId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        return run ?? null;
      }),

    deleteSop: protectedProcedure
      .input(deleteSopInput)
      .mutation(async ({ ctx, input }) => {
        const [deleted] = await db
          .delete(clerkSops)
          .where(
            and(
              eq(clerkSops.id, input.sopId),
              inArray(
                clerkSops.channelId,
                db
                  .select({ id: channels.id })
                  .from(channels)
                  .where(eq(channels.userId, ctx.user.id)),
              ),
            ),
          )
          .returning({ id: clerkSops.id });
        return { id: deleted?.id ?? null };
      }),
  }),

  muse: router({
    startMonitor: protectedProcedure
      .input(startMonitorInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });
        if (!channel.competitors || channel.competitors.length === 0) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先为该频道配置至少一个对标账号",
          });
        }

        await assertNoActiveRun(channel.id, "muse");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "muse",
            command: "muse-monitor-competitors",
            status: "pending",
            configJson: {
              maxVideosPerCompetitor: input.maxVideosPerCompetitor,
              numIdeasPerVideo: input.numIdeasPerVideo,
              language: input.language,
            },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("muse-monitor-competitors", {
          channelId: channel.id,
          runId: run.id,
          maxVideosPerCompetitor: input.maxVideosPerCompetitor,
          numIdeasPerVideo: input.numIdeasPerVideo,
          language: input.language,
        });

        await db
          .update(pipelineRuns)
          .set({
            configJson: {
              maxVideosPerCompetitor: input.maxVideosPerCompetitor,
              numIdeasPerVideo: input.numIdeasPerVideo,
              language: input.language,
              triggerRunId: handle.id,
            },
          })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),

    activeRun: protectedProcedure
      .input(z.object({ channelId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [active] = await db
          .select({ id: pipelineRuns.id, configJson: pipelineRuns.configJson })
          .from(pipelineRuns)
          .innerJoin(channels, eq(channels.id, pipelineRuns.channelId))
          .where(
            and(
              eq(pipelineRuns.channelId, input.channelId),
              eq(channels.userId, ctx.user.id),
              eq(pipelineRuns.agent, "muse"),
              inArray(pipelineRuns.status, ["pending", "running"]),
            ),
          )
          .orderBy(desc(pipelineRuns.startedAt))
          .limit(1);

        if (!active) return null;
        const triggerRunId = (active.configJson as { triggerRunId?: string } | null)?.triggerRunId;
        if (!triggerRunId) return null;

        const token = await auth.createPublicToken({
          scopes: { read: { runs: [triggerRunId] } },
          expirationTime: "1h",
        });
        return { runId: active.id, triggerRunId, publicAccessToken: token };
      }),

    approveIdea: protectedProcedure
      .input(approveIdeaInput)
      .mutation(async ({ ctx, input }) => {
        const [updated] = await db
          .update(museIdeas)
          .set({
            approved: input.approved,
            approvedAt: input.approved ? new Date() : null,
          })
          .where(
            and(
              eq(museIdeas.id, input.ideaId),
              inArray(
                museIdeas.channelId,
                db
                  .select({ id: channels.id })
                  .from(channels)
                  .where(eq(channels.userId, ctx.user.id)),
              ),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),
  }),

  poet: router({
    generateBible: protectedProcedure
      .input(generateBibleInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

        await assertNoActiveRun(channel.id, "poet");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "poet",
            command: "poet-generate-bible",
            status: "pending",
            configJson: { language: input.language, kind: "bible" },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("poet-generate-bible", {
          channelId: channel.id,
          runId: run.id,
          ideaText: input.ideaText,
          name: input.name,
          language: input.language,
        });

        await db
          .update(pipelineRuns)
          .set({ configJson: { language: input.language, kind: "bible", triggerRunId: handle.id } })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),

    updateBible: protectedProcedure
      .input(updateBibleInput)
      .mutation(async ({ ctx, input }) => {
        const [updated] = await db
          .update(poetBible)
          .set({
            name: input.name ?? undefined,
            content: input.content ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(poetBible.id, input.bibleId),
              inArray(
                poetBible.channelId,
                db
                  .select({ id: channels.id })
                  .from(channels)
                  .where(eq(channels.userId, ctx.user.id)),
              ),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    activateBible: protectedProcedure
      .input(switchActiveBibleInput)
      .mutation(async ({ ctx, input }) => {
        const [target] = await db
          .select()
          .from(poetBible)
          .innerJoin(channels, eq(channels.id, poetBible.channelId))
          .where(and(eq(poetBible.id, input.bibleId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });

        await db
          .update(poetBible)
          .set({ isActive: false })
          .where(
            and(
              eq(poetBible.channelId, target.poet_bible.channelId),
              eq(poetBible.isActive, true),
            ),
          );
        const [activated] = await db
          .update(poetBible)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(poetBible.id, input.bibleId))
          .returning();
        return activated;
      }),

    generateScript: protectedProcedure
      .input(generateScriptInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

        const [activeBible] = await db
          .select({ id: poetBible.id })
          .from(poetBible)
          .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
          .limit(1);
        if (!activeBible) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先为该频道生成并激活一份频道圣经",
          });
        }

        const [idea] = await db
          .select({ id: museIdeas.id, approved: museIdeas.approved })
          .from(museIdeas)
          .where(and(eq(museIdeas.id, input.ideaId), eq(museIdeas.channelId, channel.id)))
          .limit(1);
        if (!idea) throw new TRPCError({ code: "NOT_FOUND", message: "选题不存在" });
        if (!idea.approved) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先通过该选题再开始写稿",
          });
        }

        await assertNoActiveRun(channel.id, "poet");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "poet",
            command: "poet-generate-script",
            status: "pending",
            configJson: {
              kind: "script",
              ideaId: input.ideaId,
              language: input.language,
              durationMinutes: input.durationMinutes,
            },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("poet-generate-script", {
          channelId: channel.id,
          runId: run.id,
          ideaId: input.ideaId,
          language: input.language,
          durationMinutes: input.durationMinutes,
        });

        await db
          .update(pipelineRuns)
          .set({
            configJson: {
              kind: "script",
              ideaId: input.ideaId,
              language: input.language,
              durationMinutes: input.durationMinutes,
              triggerRunId: handle.id,
            },
          })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),

    activeRun: protectedProcedure
      .input(z.object({ channelId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [active] = await db
          .select({
            id: pipelineRuns.id,
            configJson: pipelineRuns.configJson,
            command: pipelineRuns.command,
          })
          .from(pipelineRuns)
          .innerJoin(channels, eq(channels.id, pipelineRuns.channelId))
          .where(
            and(
              eq(pipelineRuns.channelId, input.channelId),
              eq(channels.userId, ctx.user.id),
              eq(pipelineRuns.agent, "poet"),
              inArray(pipelineRuns.status, ["pending", "running"]),
            ),
          )
          .orderBy(desc(pipelineRuns.startedAt))
          .limit(1);

        if (!active) return null;
        const triggerRunId = (active.configJson as { triggerRunId?: string } | null)?.triggerRunId;
        if (!triggerRunId) return null;

        const token = await auth.createPublicToken({
          scopes: { read: { runs: [triggerRunId] } },
          expirationTime: "1h",
        });
        return {
          runId: active.id,
          triggerRunId,
          publicAccessToken: token,
          kind:
            active.command === "poet-generate-bible"
              ? ("bible" as const)
              : active.command === "poet-analyze-custom-topic"
                ? ("analyze" as const)
                : ("script" as const),
        };
      }),

    listCustomTopics: protectedProcedure
      .input(z.object({ channelId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
        return db
          .select()
          .from(poetCustomTopics)
          .where(eq(poetCustomTopics.channelId, channel.id))
          .orderBy(desc(poetCustomTopics.updatedAt));
      }),

    createCustomTopic: protectedProcedure
      .input(createCustomTopicInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });
        const [created] = await db
          .insert(poetCustomTopics)
          .values({
            channelId: channel.id,
            topic: input.topic,
            references: input.references.map((r) => ({
              kind: r.kind,
              url: r.url,
              text: r.text,
              title: r.title,
            })),
            language: input.language,
            status: "draft",
          })
          .returning();
        return created!;
      }),

    updateCustomTopic: protectedProcedure
      .input(updateCustomTopicInput)
      .mutation(async ({ ctx, input }) => {
        const [updated] = await db
          .update(poetCustomTopics)
          .set({
            topic: input.topic ?? undefined,
            references: input.references
              ? input.references.map((r) => ({
                  kind: r.kind,
                  url: r.url,
                  text: r.text,
                  title: r.title,
                }))
              : undefined,
            language: input.language ?? undefined,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(poetCustomTopics.id, input.topicId),
              inArray(
                poetCustomTopics.channelId,
                db
                  .select({ id: channels.id })
                  .from(channels)
                  .where(eq(channels.userId, ctx.user.id)),
              ),
            ),
          )
          .returning();
        if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
        return updated;
      }),

    deleteCustomTopic: protectedProcedure
      .input(deleteCustomTopicInput)
      .mutation(async ({ ctx, input }) => {
        const [deleted] = await db
          .delete(poetCustomTopics)
          .where(
            and(
              eq(poetCustomTopics.id, input.topicId),
              inArray(
                poetCustomTopics.channelId,
                db
                  .select({ id: channels.id })
                  .from(channels)
                  .where(eq(channels.userId, ctx.user.id)),
              ),
            ),
          )
          .returning({ id: poetCustomTopics.id });
        return { id: deleted?.id ?? null };
      }),

    analyzeCustomTopic: protectedProcedure
      .input(analyzeCustomTopicInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

        const [activeBible] = await db
          .select({ id: poetBible.id })
          .from(poetBible)
          .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
          .limit(1);
        if (!activeBible) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先生成并激活一份频道圣经",
          });
        }

        await assertNoActiveRun(channel.id, "poet");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "poet",
            command: "poet-analyze-custom-topic",
            status: "pending",
            configJson: { kind: "analyze", topicId: input.topicId, language: input.language },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("poet-analyze-custom-topic", {
          channelId: channel.id,
          runId: run.id,
          topicId: input.topicId,
          language: input.language,
        });

        await db
          .update(pipelineRuns)
          .set({
            configJson: {
              kind: "analyze",
              topicId: input.topicId,
              language: input.language,
              triggerRunId: handle.id,
            },
          })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),

    deleteBible: protectedProcedure
      .input(deleteBibleInput)
      .mutation(async ({ ctx, input }) => {
        const [existing] = await db
          .select({ id: poetBible.id, isActive: poetBible.isActive })
          .from(poetBible)
          .innerJoin(channels, eq(channels.id, poetBible.channelId))
          .where(and(eq(poetBible.id, input.bibleId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
        if (existing.isActive) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "无法删除生效中的圣经，请先激活另一份后再删",
          });
        }
        const [deleted] = await db
          .delete(poetBible)
          .where(eq(poetBible.id, input.bibleId))
          .returning({ id: poetBible.id });
        return { id: deleted?.id ?? null };
      }),

    deleteScript: protectedProcedure
      .input(deleteScriptInput)
      .mutation(async ({ ctx, input }) => {
        const [existing] = await db
          .select({
            id: poetScripts.id,
            ideaId: poetScripts.ideaId,
            customTopicId: poetScripts.customTopicId,
          })
          .from(poetScripts)
          .innerJoin(channels, eq(channels.id, poetScripts.channelId))
          .where(and(eq(poetScripts.id, input.scriptId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

        await db.delete(poetScripts).where(eq(poetScripts.id, input.scriptId));

        // Reset source status so the user can re-generate from the same idea / topic.
        if (existing.ideaId) {
          await db
            .update(museIdeas)
            .set({ scripted: false })
            .where(eq(museIdeas.id, existing.ideaId));
        }
        if (existing.customTopicId) {
          await db
            .update(poetCustomTopics)
            .set({ status: "analyzed", updatedAt: new Date() })
            .where(eq(poetCustomTopics.id, existing.customTopicId));
        }
        return { id: existing.id };
      }),

    generateScriptFromCustomTopic: protectedProcedure
      .input(generateScriptFromCustomTopicInput)
      .mutation(async ({ ctx, input }) => {
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND" });

        const [activeBible] = await db
          .select({ id: poetBible.id })
          .from(poetBible)
          .where(and(eq(poetBible.channelId, channel.id), eq(poetBible.isActive, true)))
          .limit(1);
        if (!activeBible) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先生成并激活一份频道圣经",
          });
        }

        const [topic] = await db
          .select({ id: poetCustomTopics.id, status: poetCustomTopics.status })
          .from(poetCustomTopics)
          .where(
            and(
              eq(poetCustomTopics.id, input.topicId),
              eq(poetCustomTopics.channelId, channel.id),
            ),
          )
          .limit(1);
        if (!topic) throw new TRPCError({ code: "NOT_FOUND", message: "自定义选题不存在" });
        if (topic.status !== "analyzed" && topic.status !== "scripted") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "请先分析该自定义选题再开始写稿",
          });
        }

        await assertNoActiveRun(channel.id, "poet");

        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "poet",
            command: "poet-generate-script",
            status: "pending",
            configJson: {
              kind: "script",
              customTopicId: input.topicId,
              language: input.language,
              durationMinutes: input.durationMinutes,
            },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        const handle = await tasks.trigger("poet-generate-script", {
          channelId: channel.id,
          runId: run.id,
          customTopicId: input.topicId,
          language: input.language,
          durationMinutes: input.durationMinutes,
        });

        await db
          .update(pipelineRuns)
          .set({
            configJson: {
              kind: "script",
              customTopicId: input.topicId,
              language: input.language,
              durationMinutes: input.durationMinutes,
              triggerRunId: handle.id,
            },
          })
          .where(eq(pipelineRuns.id, run.id));

        return {
          runId: run.id,
          triggerRunId: handle.id,
          publicAccessToken: handle.publicAccessToken,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
