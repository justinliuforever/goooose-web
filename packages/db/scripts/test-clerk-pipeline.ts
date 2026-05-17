/**
 * End-to-end diagnostic for the Clerk pipeline.
 *
 *   1. Inserts a temporary "Test channel" pointing at a real YouTube
 *      handle (LinusTechTips by default).
 *   2. Creates a pipeline_runs row.
 *   3. Triggers the clerk-analyze-channel Trigger.dev task.
 *   4. Polls the run status every 5s until COMPLETED / FAILED / timeout.
 *   5. Prints final clerk_videos rows for the test channel.
 *   6. Deletes the test channel (cascade clears clerk_videos rows).
 *
 * Requires:
 *   - Trigger.dev worker running in another terminal:
 *     pnpm --filter @singularity/jobs dev
 *
 * Run:
 *   pnpm --filter @singularity/db exec tsx scripts/test-clerk-pipeline.ts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runs, tasks } from "@trigger.dev/sdk";

import { channels, clerkVideos, pipelineRuns, users } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const TEST_HANDLE_URL = process.env.TEST_HANDLE_URL ?? "https://www.youtube.com/@mkbhd";
const TEST_LIMIT = Number(process.env.TEST_LIMIT ?? 2);
const KEEP_CHANNEL = process.env.KEEP_CHANNEL === "1";
const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 600000;
const TARGET_EMAIL = "justinliuforever@gmail.com";

async function main() {
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY not set");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  const client = postgres(process.env.DATABASE_URL, { prepare: false });
  const db = drizzle(client);

  console.log(`Test target: ${TEST_HANDLE_URL} (limit=${TEST_LIMIT})\n`);

  const [user] = await db.select().from(users).where(eq(users.email, TARGET_EMAIL));
  if (!user) throw new Error(`User ${TARGET_EMAIL} not found`);

  const testSlug = `__pipeline_test_${Date.now()}`;
  console.log(`Creating temp channel ${testSlug}…`);
  const [channel] = await db
    .insert(channels)
    .values({
      userId: user.id,
      name: testSlug,
      slug: testSlug,
      platform: "youtube",
      platformUrl: TEST_HANDLE_URL,
      competitors: [],
    })
    .returning();
  if (!channel) throw new Error("channel insert failed");

  try {
    console.log(`Creating pipeline_runs row…`);
    const [run] = await db
      .insert(pipelineRuns)
      .values({
        channelId: channel.id,
        agent: "clerk",
        command: "clerk-analyze-channel",
        status: "pending",
        configJson: { limit: TEST_LIMIT, language: "en" },
      })
      .returning();
    if (!run) throw new Error("run insert failed");

    console.log(`Triggering Trigger.dev task…`);
    const handle = await tasks.trigger("clerk-analyze-channel", {
      channelId: channel.id,
      runId: run.id,
      limit: TEST_LIMIT,
      language: "en",
    });
    console.log(`  trigger run id: ${handle.id}\n`);

    console.log(`Polling task status (every ${POLL_INTERVAL_MS / 1000}s)…`);
    const startedAt = Date.now();
    let finalStatus: string | undefined;
    while (Date.now() - startedAt < TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const triggerRun = await runs.retrieve(handle.id);
      const ms = Date.now() - startedAt;
      console.log(
        `  [${(ms / 1000).toFixed(0).padStart(3)}s] status=${triggerRun.status}` +
          (triggerRun.metadata?.progress
            ? ` progress=${JSON.stringify(triggerRun.metadata.progress)}`
            : ""),
      );
      const terminal = [
        "COMPLETED",
        "FAILED",
        "CANCELED",
        "CRASHED",
        "SYSTEM_FAILURE",
        "TIMED_OUT",
        "EXPIRED",
      ];
      if (terminal.includes(triggerRun.status)) {
        finalStatus = triggerRun.status;
        console.log(`\nTask ended with: ${finalStatus}`);
        if (finalStatus === "COMPLETED") {
          console.log(`Output: ${JSON.stringify(triggerRun.output)}`);
        } else if (triggerRun.error) {
          console.log(`Error: ${JSON.stringify(triggerRun.error)}`);
        }
        break;
      }
    }

    if (!finalStatus) {
      console.log("\nTimeout — task did not complete within window.");
    }

    console.log(`\nChecking clerk_videos rows for test channel…`);
    const analyzedVideos = await db
      .select({
        platformVideoId: clerkVideos.platformVideoId,
        title: clerkVideos.title,
        views: clerkVideos.views,
        openingHookType: clerkVideos.openingHookType,
        framework: clerkVideos.framework,
        analyzedAt: clerkVideos.analyzedAt,
      })
      .from(clerkVideos)
      .where(eq(clerkVideos.channelId, channel.id));
    console.log(`Found ${analyzedVideos.length} rows`);
    for (const v of analyzedVideos) {
      console.log(`\n  ${v.platformVideoId} | ${v.title.slice(0, 60)}`);
      console.log(`    views: ${v.views?.toLocaleString("en-US") ?? "—"}`);
      console.log(`    opening_hook_type: ${v.openingHookType ?? "—"}`);
      console.log(`    framework: ${(v.framework ?? "").slice(0, 100)}`);
      console.log(`    analyzed_at: ${v.analyzedAt?.toISOString() ?? "—"}`);
    }

    console.log(`\nFinal pipeline_runs row:`);
    const [finalRun] = await db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, run.id));
    console.log(`  status: ${finalRun?.status}`);
    console.log(`  progress: ${finalRun?.progress}/${finalRun?.total}`);
    if (finalRun?.errorMessage) {
      console.log(`  error: ${finalRun.errorMessage}`);
    }
  } finally {
    if (KEEP_CHANNEL) {
      console.log(`\nKeeping test channel ${channel.slug} (KEEP_CHANNEL=1). Run delete manually later.`);
    } else {
      console.log(`\nCleaning up: delete test channel ${channel.slug}…`);
      await db.delete(channels).where(eq(channels.id, channel.id));
    }
    await client.end();
    console.log(`Done.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
