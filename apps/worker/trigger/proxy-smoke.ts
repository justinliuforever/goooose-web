import { logger, task } from "@trigger.dev/sdk";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { flushProxyPool, loadProxyPool } from "@singularity/db";
import { transcribeYoutubeVideo } from "@singularity/shared/clients/asr";

type Payload = {
  videoIds?: string[];
};

export const proxySmoke = task({
  id: "proxy-smoke",
  machine: { preset: "medium-1x" },
  maxDuration: 900,
  run: async (payload: Payload) => {
    const videoIds = payload.videoIds ?? [
      "dQw4w9WgXcQ",
      "3tbB2dffx0s",
      "gwTQLZSIlsU",
      "41Dnn_vG0O4",
    ];

    const client = postgres(process.env.DATABASE_URL!, { prepare: false });
    const db = drizzle(client);

    try {
      const pool = await loadProxyPool(db, { provider: "wealthproxies" });
      logger.info(`Pool loaded: ${pool.size} sessions (${pool.aliveCount} alive)`);
      if (pool.size === 0) throw new Error("Empty pool — seed DB first");

      const results: Array<{
        videoId: string;
        ok: boolean;
        chars: number;
        provider?: string;
        ms: number;
        error?: string;
      }> = [];

      for (const videoId of videoIds) {
        const t0 = Date.now();
        try {
          const result = await transcribeYoutubeVideo(videoId, pool, {
            logger,
            tag: `smoke ${videoId}`,
          });
          results.push({
            videoId,
            ok: !!result,
            chars: result?.text.length ?? 0,
            provider: result?.provider,
            ms: Date.now() - t0,
          });
        } catch (err) {
          results.push({
            videoId,
            ok: false,
            chars: 0,
            ms: Date.now() - t0,
            error: (err as Error).message?.slice(0, 200),
          });
        }
      }

      const flushed = await flushProxyPool(db, pool);
      const stats = pool.stats();

      for (const r of results) {
        logger.info(
          `[${r.videoId}] ok=${r.ok} chars=${r.chars} provider=${r.provider ?? "?"} ms=${r.ms} ${r.error ?? ""}`,
        );
      }

      return {
        results,
        pool: {
          flushed: flushed.updatedSessions,
          newlyDisabled: flushed.newlyDisabled,
          ...stats,
        },
      };
    } finally {
      await client.end();
    }
  },
});
