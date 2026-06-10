// READ-ONLY: dump the latest generated output per test channel/feature into
// /tmp/eval/*.md + index.json for the content-quality eval workflow.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });

const OUT = "/tmp/eval";
mkdirSync(OUT, { recursive: true });

const index: Array<Record<string, unknown>> = [];
function emit(key: string, feature: string, channel: string, meta: Record<string, unknown>, body: string) {
  const file = `${OUT}/${key}.md`;
  writeFileSync(file, `# ${feature} — ${channel}\n\n${JSON.stringify(meta)}\n\n---\n\n${body}\n`);
  index.push({ key, feature, channel, file, ...meta });
  console.error(`  ${key}: ${body.length} chars`);
}

try {
  // --- Clerk SOPs (latest per channel) ---
  const sopChans = [
    { key: "clerk_xhs", channel: "表叔王寂 XHS", id: "115a3d60-162f-4482-a121-fb52e883966b" },
    { key: "clerk_yt_en", channel: "petapixel YT (EN)", id: "85dc87b9-cce9-40d4-96a8-23a6af04c7e3" },
    { key: "clerk_yt_cn", channel: "梵高 YT (CN)", id: "ba2ed94c-2081-46ff-932e-b04073d8c04d" },
  ];
  for (const c of sopChans) {
    const rows = await sql`SELECT DISTINCT ON (sop_type) sop_type, language, content_md, updated_at FROM clerk_sops WHERE channel_id = ${c.id} ORDER BY sop_type, updated_at DESC`;
    for (const r of rows) {
      emit(`${c.key}__${r.sop_type}`, `Clerk SOP (${r.sop_type})`, c.channel,
        { sopType: r.sop_type, language: r.language, updatedAt: r.updated_at, chars: (r.content_md ?? "").length },
        r.content_md ?? "(empty)");
    }
  }

  // --- Bibles ---
  for (const c of [
    { key: "bible_first", channel: "暴打咸鱼传家宝 (first/auto-activate)", id: "660c0a3d-0e7f-40ec-b0bf-da11216ac7df" },
  ]) {
    const rows = await sql`SELECT name, content, is_active, source_idea, generated_at FROM poet_bible WHERE channel_id = ${c.id} ORDER BY generated_at DESC`;
    emit(c.key, "Poet Bible", c.channel,
      { versions: rows.length, activeCount: rows.filter((r) => r.is_active).length, names: rows.map((r) => r.name) },
      (rows[0]?.content as string) ?? "(none)");
  }

  // --- Scripts ---
  for (const c of [
    { key: "script_short", channel: "纽约野富美 (≤60s)", id: "890a4752-d79f-4419-b941-e932d6ddab96" },
    { key: "script_long", channel: "表叔王寂 YT (long-form)", id: "48d98f95-7bdd-4259-8e10-1750123abdd5" },
  ]) {
    const [r] = await sql`SELECT script_text, word_count, duration_seconds, language, generated_at FROM poet_scripts WHERE channel_id = ${c.id} ORDER BY generated_at DESC LIMIT 1`;
    emit(c.key, "Poet Script", c.channel,
      { wordCount: r?.word_count, durationSeconds: r?.duration_seconds, language: r?.language, actualChars: (r?.script_text ?? "").length },
      (r?.script_text as string) ?? "(none)");
  }

  // --- Muse ideas (latest 6 per channel) ---
  for (const c of [
    { key: "muse_xhs", channel: "红发魔女 ch-yic805 (XHS competitor, fresh v6)", id: "02473041-fce8-4d0f-9235-6995c91d4148" },
  ]) {
    const rows = await sql`SELECT idea_number, story_angle, facts_and_data, why_similar, viral_trigger, cover_concept, suggested_hook_type, risk_factors, generated_at FROM muse_ideas WHERE channel_id = ${c.id} ORDER BY generated_at DESC LIMIT 5`;
    emit(c.key, "Muse Ideas", c.channel, { count: rows.length },
      rows.map((r, i) => `## Idea ${i + 1}\n${JSON.stringify(r, null, 2)}`).join("\n\n"));
  }

  // --- Custom topic analysis ---
  {
    const [r] = await sql`SELECT topic, story_angle, facts_and_data, verbatim_facts, why_similar, viral_trigger, status, updated_at FROM poet_custom_topics WHERE id = '3c73da4c-2dae-48a4-a54f-8440021d0de0'`;
    emit("custom_topic_analyze", "Poet Custom Topic Analysis", "kai-w", { status: r?.status, topic: r?.topic },
      r ? JSON.stringify(r, null, 2) : "(none)");
  }

  writeFileSync(`${OUT}/index.json`, JSON.stringify(index, null, 2));
  console.error(`\nWrote ${index.length} outputs to ${OUT}/`);
} finally {
  await sql.end();
}
