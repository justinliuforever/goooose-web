// AUTHORIZED one-off (2026-06): insert minimal pipeline_runs rows for the full
// feature test campaign, resolving dynamic FKs (idea/topic). Prints a trigger
// manifest (JSON on stdout; progress on stderr). Additive only.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

type Item = {
  key: string;
  agent: "clerk" | "muse" | "poet";
  command: string;
  channelId: string;
  config: Record<string, unknown>;
  payload: Record<string, unknown>;
  needs?: "ideaId" | "customTopicId" | "topicId";
};

const PLAN: Item[] = [
  // Clerk — XHS headline (the 48min channel) + YouTube English + YouTube Chinese probe
  { key: "clerk_xhs", agent: "clerk", command: "clerk-analyze-channel", channelId: "115a3d60-162f-4482-a121-fb52e883966b",
    config: { limit: 15, language: "zh", mode: "overwrite", source: "newest" },
    payload: { limit: 15, language: "zh", mode: "overwrite", source: "newest" } },
  { key: "clerk_yt_en", agent: "clerk", command: "clerk-analyze-channel", channelId: "85dc87b9-cce9-40d4-96a8-23a6af04c7e3",
    config: { limit: 6, language: "en", mode: "overwrite", source: "newest" },
    payload: { limit: 6, language: "en", mode: "overwrite", source: "newest" } },
  { key: "clerk_yt_cn", agent: "clerk", command: "clerk-analyze-channel", channelId: "ba2ed94c-2081-46ff-932e-b04073d8c04d",
    config: { limit: 4, language: "zh", mode: "overwrite", source: "newest" },
    payload: { limit: 4, language: "zh", mode: "overwrite", source: "newest" } },
  // Bible — first version (auto-activate) + second version (no takeover, multi-version)
  { key: "bible_first", agent: "poet", command: "poet-generate-bible", channelId: "660c0a3d-0e7f-40ec-b0bf-da11216ac7df",
    config: { language: "zh", kind: "bible" },
    payload: { ideaText: "基于频道已分析内容,提炼该频道的定位、受众与表达风格圣经", language: "zh", name: "测试 Bible 首版" } },
  { key: "bible_multiversion", agent: "poet", command: "poet-generate-bible", channelId: "5d266bea-6b29-4930-9823-4ae7fbe496a0",
    config: { language: "zh", kind: "bible" },
    payload: { ideaText: "在已有圣经基础上生成一份新版本,以验证多版本并存", language: "zh", name: "测试 Bible 第二版" } },
  // Muse — XHS competitor path + YouTube competitor path
  { key: "muse_xhs", agent: "muse", command: "muse-monitor-competitors", channelId: "45077918-69f9-4d57-94f1-59e210c7c5d6",
    config: { maxVideosPerCompetitor: 3, numIdeasPerVideo: 5, language: "zh" },
    payload: { maxVideosPerCompetitor: 3, numIdeasPerVideo: 5, language: "zh" } },
  { key: "muse_yt", agent: "muse", command: "muse-monitor-competitors", channelId: "20772f56-d76c-4a73-9f5a-071df55bd438",
    config: { maxVideosPerCompetitor: 3, numIdeasPerVideo: 5, language: "zh" },
    payload: { maxVideosPerCompetitor: 3, numIdeasPerVideo: 5, language: "zh" } },
  // Series detect (YouTube-only)
  { key: "series_detect", agent: "clerk", command: "clerk-detect-channel-series", channelId: "582123cd-4a70-47b6-b426-ae0155490b79",
    config: { videoCount: 50, language: "zh" },
    payload: { videoCount: 50, language: "zh" } },
  // Script — short (≤60s) from an idea; long (≥2000字) from a custom topic
  { key: "script_short", agent: "poet", command: "poet-generate-script", channelId: "890a4752-d79f-4419-b941-e932d6ddab96",
    needs: "ideaId", config: { kind: "script", language: "zh", durationSeconds: 30 },
    payload: { language: "zh", durationSeconds: 30 } },
  { key: "script_long", agent: "poet", command: "poet-generate-script", channelId: "48d98f95-7bdd-4259-8e10-1750123abdd5",
    needs: "customTopicId", config: { kind: "script", language: "zh", durationSeconds: 900 },
    payload: { language: "zh", durationSeconds: 900 } },
  // Custom topic analyze
  { key: "custom_topic_analyze", agent: "poet", command: "poet-analyze-custom-topic", channelId: "8825dc91-fb6e-4c96-a968-80c7ac7c063b",
    needs: "topicId", config: { kind: "analyze", language: "zh" },
    payload: { language: "zh" } },
];

async function resolveExtra(item: Item): Promise<Record<string, unknown> | null> {
  if (item.needs === "ideaId") {
    const [r] = await sql`SELECT id FROM muse_ideas WHERE channel_id = ${item.channelId} ORDER BY id LIMIT 1`;
    return r ? { ideaId: r.id } : null;
  }
  if (item.needs === "customTopicId") {
    const [r] = await sql`SELECT id FROM poet_custom_topics WHERE channel_id = ${item.channelId} AND status IN ('analyzed','scripted') ORDER BY id LIMIT 1`;
    return r ? { customTopicId: r.id } : null;
  }
  if (item.needs === "topicId") {
    const [r] = await sql`SELECT id FROM poet_custom_topics WHERE channel_id = ${item.channelId} ORDER BY id LIMIT 1`;
    return r ? { topicId: r.id } : null;
  }
  return {};
}

const manifest: unknown[] = [];
try {
  for (const item of PLAN) {
    const extra = await resolveExtra(item);
    if (extra === null) {
      console.error(`SKIP ${item.key}: could not resolve ${item.needs} for channel ${item.channelId}`);
      continue;
    }
    const cfg = { ...item.config, ...extra };
    const [run] = await sql`
      INSERT INTO pipeline_runs (channel_id, agent, command, status, config_json)
      VALUES (${item.channelId}, ${item.agent}, ${item.command}, 'pending', ${sql.json(cfg)})
      RETURNING id`;
    manifest.push({
      key: item.key,
      taskId: item.command,
      channelId: item.channelId,
      runId: run.id,
      payload: { channelId: item.channelId, runId: run.id, ...item.payload, ...extra },
    });
    console.error(`OK ${item.key}: pipeline_run ${run.id}`);
  }
  writeFileSync("/tmp/singularity-test-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await sql.end();
}
