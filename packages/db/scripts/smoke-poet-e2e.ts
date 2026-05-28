// End-to-end Poet smoke: stages a complete bible→topic→script chain in DB and
// prints the IDs needed to trigger each step via `mcp__trigger__trigger_task`.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { channels, pipelineRuns, poetCustomTopics } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const channelId = process.argv[2];
const topicTitle = process.argv[3];
if (!channelId || !topicTitle) {
  console.error("Usage: tsx smoke-poet-e2e.ts <channelId> <topicTitle>");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

try {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) {
    console.error(`channel ${channelId} not found`);
    process.exit(1);
  }
  console.log(`channel: ${channel.name} (${channel.platform})`);
  console.log(`description: ${channel.description?.slice(0, 200) ?? "<empty>"}`);

  const [bibleRun] = await db
    .insert(pipelineRuns)
    .values({
      channelId,
      agent: "poet",
      command: "poet-generate-bible",
      status: "pending",
      configJson: { smoke: true, language: "en" },
      status: "failed",
      errorMessage: "Smoke placeholder — trigger via MCP if needed",
      completedAt: new Date(),
    })
    .returning({ id: pipelineRuns.id });

  const [topic] = await db
    .insert(poetCustomTopics)
    .values({
      channelId,
      topic: topicTitle,
      references: [],
      language: "en",
      durationMinutes: 5,
      targetWordCount: 750,
    })
    .returning({ id: poetCustomTopics.id });

  const [topicRun] = await db
    .insert(pipelineRuns)
    .values({
      channelId,
      agent: "poet",
      command: "poet-analyze-custom-topic",
      status: "pending",
      configJson: { smoke: true, topicId: topic!.id },
    })
    .returning({ id: pipelineRuns.id });

  const [scriptRun] = await db
    .insert(pipelineRuns)
    .values({
      channelId,
      agent: "poet",
      command: "poet-generate-script",
      status: "pending",
      configJson: { smoke: true, customTopicId: topic!.id, durationMinutes: 5 },
    })
    .returning({ id: pipelineRuns.id });

  console.log(
    JSON.stringify(
      {
        channelId,
        topicId: topic!.id,
        bibleRunId: bibleRun!.id,
        topicRunId: topicRun!.id,
        scriptRunId: scriptRun!.id,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
