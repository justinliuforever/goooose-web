import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auth, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

import { channels, museIdeas, pipelineRuns } from "@singularity/db";

import { db } from "@/lib/db";
import { protectedProcedure, router } from "./init";
import { createChannelInput, deleteChannelInput, updateChannelInput } from "./schemas/channels";
import { runStatusInput, startAnalysisInput } from "./schemas/clerk";
import { approveIdeaInput, startMonitorInput } from "./schemas/muse";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "channel";
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
  }),

  clerk: router({
    startAnalysis: protectedProcedure
      .input(startAnalysisInput)
      .mutation(async ({ ctx, input }) => {
        // 1. Verify channel belongs to user
        const [channel] = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, input.channelId), eq(channels.userId, ctx.user.id)))
          .limit(1);
        if (!channel) throw new TRPCError({ code: "NOT_FOUND", message: "Channel not found" });

        // 2. Create pipeline_runs row
        const [run] = await db
          .insert(pipelineRuns)
          .values({
            channelId: channel.id,
            agent: "clerk",
            command: "clerk-analyze-channel",
            status: "pending",
            configJson: { limit: input.limit, language: input.language },
          })
          .returning();
        if (!run) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

        // 3. Trigger the Trigger.dev task
        const handle = await tasks.trigger("clerk-analyze-channel", {
          channelId: channel.id,
          runId: run.id,
          limit: input.limit,
          language: input.language,
        });

        // 4. Persist the trigger run id so we can recover it after refresh
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

    /**
     * On page mount, the frontend checks if there's an analysis already
     * running for this channel. If yes, server reissues a scoped public
     * access token so useRealtimeRun can attach. This recovers progress
     * after a refresh.
     */
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
});

export type AppRouter = typeof appRouter;
