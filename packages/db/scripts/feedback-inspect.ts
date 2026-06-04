// Throwaway inspection for 3rd-feedback validation: SOP coverage (#7), bible gen
// durations (#4), and pulls real material for the translationese A/B (#1).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
import { desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  channels,
  clerkSops,
  clerkVideos,
  poetScripts,
  poetBible,
  pipelineRuns,
} from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const FLAGGED = ["社会仪式", "签名式", "认知基模", "基模", "主题聚类", "炸弹"];
const TRANSLATIONESE = ["进行", "加以", "予以", "给予", "值得注意的是", "总而言之", "众所周知", "之一", "性。"];
function countMarkers(text: string, markers: string[]) {
  const out: Record<string, number> = {};
  for (const m of markers) {
    const n = text.split(m).length - 1;
    if (n > 0) out[m] = n;
  }
  return out;
}

try {
  const chans = await db.select().from(channels);
  const sops = await db.select().from(clerkSops);
  const scripts = await db.select().from(poetScripts).orderBy(desc(poetScripts.generatedAt)).limit(60);

  // ---- #7 SOP coverage ----
  const byChan = new Map<string, Set<string>>();
  for (const s of sops) {
    if (!byChan.has(s.channelId)) byChan.set(s.channelId, new Set());
    byChan.get(s.channelId)!.add(s.sopType);
  }
  let withAiRef = 0;
  const noAiRef: string[] = [];
  for (const c of chans) {
    const types = byChan.get(c.id);
    if (types?.has("ai_reference")) withAiRef++;
    else noAiRef.push(`${c.name}(${c.platform})`);
  }
  const scriptNullSop = scripts.filter((s) => !s.sopId).length;

  console.log("==== #7 SOP coverage ====");
  console.log(`channels: ${chans.length} | with ai_reference SOP: ${withAiRef} | without: ${noAiRef.length}`);
  console.log(`  channels missing ai_reference:`, noAiRef.slice(0, 30).join(", ") || "(none)");
  console.log(`recent poet_scripts: ${scripts.length} | with sopId: ${scripts.length - scriptNullSop} | NULL sopId: ${scriptNullSop}`);

  // ---- #4 bible gen durations ----
  const poetRuns = await db.select().from(pipelineRuns).orderBy(desc(pipelineRuns.startedAt)).limit(200);
  const bibleRuns = poetRuns.filter((r) => r.agent === "poet" && /bible|圣经/i.test(r.command));
  console.log("\n==== #4 bible generation durations ====");
  console.log(`poet runs (last 200): ${poetRuns.filter((r) => r.agent === "poet").length} | bible-ish: ${bibleRuns.length}`);
  const durs: number[] = [];
  for (const r of bibleRuns) {
    if (r.completedAt && r.startedAt) {
      const sec = Math.round((+r.completedAt - +r.startedAt) / 1000);
      durs.push(sec);
      console.log(`  ${r.command} | ${r.status} | ${sec}s`);
    } else {
      console.log(`  ${r.command} | ${r.status} | (no completedAt)`);
    }
  }
  if (durs.length) {
    durs.sort((a, b) => a - b);
    const avg = Math.round(durs.reduce((s, x) => s + x, 0) / durs.length);
    console.log(`  durations(s): min ${durs[0]} | median ${durs[Math.floor(durs.length / 2)]} | max ${durs[durs.length - 1]} | avg ${avg}`);
  }
  // also dump bible content sizes (proxy for output tokens)
  const bibles = await db.select().from(poetBible).orderBy(desc(poetBible.generatedAt)).limit(10);
  console.log(`  recent bibles (n=${bibles.length}) content chars:`, bibles.map((b) => b.content.length).join(", "));

  // ---- #1 translationese prevalence in existing SOPs ----
  console.log("\n==== #1 translationese in existing human/hottest SOPs ====");
  const zhSops = sops.filter((s) => (s.sopType === "human" || s.sopType === "hottest") && s.contentMd.length > 200);
  let flaggedTotal = 0;
  for (const s of zhSops) {
    const f = countMarkers(s.contentMd, FLAGGED);
    const n = Object.values(f).reduce((a, b) => a + b, 0);
    flaggedTotal += n;
    if (n > 0) console.log(`  sop ${s.id.slice(0, 8)} ${s.sopType} chars=${s.contentMd.length} flagged:`, JSON.stringify(f));
  }
  console.log(`  total flagged-coinage hits across ${zhSops.length} zh SOPs: ${flaggedTotal}`);

  // ---- pull A/B material: longest English transcript + one human SOP ----
  const vids = await db.select().from(clerkVideos);
  const ytVids = vids
    .filter((v) => v.transcript && v.transcript.length > 1500 && /[a-zA-Z]/.test(v.transcript) && (v.transcript.match(/[a-zA-Z]/g)?.length ?? 0) > v.transcript.length * 0.4)
    .sort((a, b) => (b.transcript!.length - a.transcript!.length));
  const pick = ytVids[0];
  if (pick) {
    console.log("\n==== A/B material ====");
    console.log(`picked video: "${pick.title}" transcript chars=${pick.transcript!.length}`);
    writeFileSync("/tmp/ab_transcript.txt", pick.transcript!);
    console.log("  -> wrote /tmp/ab_transcript.txt");
    // sample existing human SOP for translationese eyeballing
    const oneHuman = zhSops.find((s) => s.sopType === "human");
    if (oneHuman) {
      writeFileSync("/tmp/existing_human_sop.md", oneHuman.contentMd);
      console.log(`  -> wrote /tmp/existing_human_sop.md (${oneHuman.contentMd.length} chars)`);
    }
  } else {
    console.log("\n(no suitable English transcript found)");
  }
} finally {
  await client.end();
}
