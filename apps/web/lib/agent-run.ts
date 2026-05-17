import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { auth } from "@trigger.dev/sdk";

import { channels, pipelineRuns } from "@singularity/db";

import { db } from "./db";

export type ActiveAgentRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

export async function getActiveAgentRun(
  channelId: string,
  userId: string,
  agent: "clerk" | "muse" | "poet",
): Promise<ActiveAgentRun | null> {
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
        eq(pipelineRuns.agent, agent),
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
}
