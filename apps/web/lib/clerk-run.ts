import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@trigger.dev/sdk";

import { channels, pipelineRuns } from "@singularity/db";

import { db } from "./db";

export type ActiveClerkRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

/**
 * Find the most recent pending / running Clerk analysis for the given
 * channel (scoped to the current user) and mint a scoped public token so
 * the client can re-attach `useRealtimeRun` after a page refresh.
 */
export async function getActiveClerkRun(
  channelId: string,
  userId: string,
): Promise<ActiveClerkRun | null> {
  const [active] = await db
    .select({
      id: pipelineRuns.id,
      configJson: pipelineRuns.configJson,
    })
    .from(pipelineRuns)
    .innerJoin(channels, eq(channels.id, pipelineRuns.channelId))
    .where(
      and(
        eq(pipelineRuns.channelId, channelId),
        eq(channels.userId, userId),
        eq(pipelineRuns.agent, "clerk"),
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
  };
}
