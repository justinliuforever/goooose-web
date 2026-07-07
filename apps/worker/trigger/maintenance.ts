import { logger, schedules } from "@trigger.dev/sdk";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { bibleImportFiles, pipelineRuns, proxySessions, refundRunQuota } from "@singularity/db";

function openDb() {
  const client = postgres(process.env.DATABASE_URL!, { prepare: false });
  return { client, db: drizzle(client) };
}

// A hard crash skips withRunDb's catch, leaving a run 'running' forever — it
// lingers in history/UI and never settles. Close pending never-started >30min
// (matches assertNoActiveRun's orphan cutoff) and running past the 4h maxDuration.
export const reapStuckRuns = schedules.task({
  id: "maint-reap-stuck-runs",
  cron: { pattern: "*/15 * * * *", environments: ["PRODUCTION"] },
  run: async () => {
    const { client, db } = openDb();
    try {
      const reaped = await db
        .update(pipelineRuns)
        .set({
          status: "failed",
          errorMessage: "任务超时未完成，已由维护任务清理",
          completedAt: new Date(),
        })
        .where(
          sql`(
            (${pipelineRuns.status} = 'pending' AND ${pipelineRuns.startedAt} < now() - interval '30 minutes')
            OR (${pipelineRuns.status} = 'running' AND ${pipelineRuns.startedAt} < now() - interval '5 hours')
          )`,
        )
        .returning({ id: pipelineRuns.id });
      for (const r of reaped) {
        await refundRunQuota(db, r.id).catch(() => {});
      }
      logger.info(`reaped ${reaped.length} stuck runs`);
      return { reaped: reaped.length };
    } finally {
      await client.end();
    }
  },
});

// Abandoned bible-import uploads hold bytea chunk rows; purge past their TTL
// (CASCADE drops the chunks). Consumed/invalid rows keep metadata but no bytes.
export const gcBibleImports = schedules.task({
  id: "maint-gc-bible-imports",
  cron: { pattern: "30 * * * *", environments: ["PRODUCTION"] },
  run: async () => {
    const { client, db } = openDb();
    try {
      const purged = await db
        .delete(bibleImportFiles)
        .where(
          and(
            inArray(bibleImportFiles.status, ["uploading", "ready"]),
            sql`${bibleImportFiles.expiresAt} < now()`,
          ),
        )
        .returning({ id: bibleImportFiles.id });
      logger.info(`purged ${purged.length} expired bible import uploads`);
      return { purged: purged.length };
    } finally {
      await client.end();
    }
  },
});

// Proxy sessions are disabled on consecutive 403s but nothing re-enables them,
// so the YouTube-ASR pool erodes permanently. Give each another chance once its
// block has likely lifted (6h cooldown).
export const reenableProxySessions = schedules.task({
  id: "maint-reenable-proxy-sessions",
  cron: { pattern: "0 * * * *", environments: ["PRODUCTION"] },
  run: async () => {
    const { client, db } = openDb();
    try {
      const reenabled = await db
        .update(proxySessions)
        .set({ enabled: true, disabledAt: null, disabledReason: null })
        .where(
          and(
            eq(proxySessions.enabled, false),
            sql`${proxySessions.disabledAt} < now() - interval '6 hours'`,
          ),
        )
        .returning({ id: proxySessions.id });
      logger.info(`re-enabled ${reenabled.length} proxy sessions after cooldown`);
      return { reenabled: reenabled.length };
    } finally {
      await client.end();
    }
  },
});
