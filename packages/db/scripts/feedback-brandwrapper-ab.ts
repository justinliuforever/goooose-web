// C6 decision gate: old forced brand-wrapper injection vs shipped soft behavior.
// (1) Replicate the OLD extractBrandWrapper regex over every real active Bible and
//     show what it would have force-injected — proves how often the anyQuoted
//     fallback grabbed junk. (2) Run the SHIPPED writeScriptShort on a real idea
//     and show the hook reads naturally.
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-brandwrapper-ab.ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { writeScriptShort } from "@singularity/shared/services/poet/script-writer";
import { channels, clerkSops, museIdeas, museMonitorVideos, poetBible } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const db = drizzle(postgres(process.env.DATABASE_URL!, { prepare: false }));

// Exact replica of the REMOVED scriptWriter.extractBrandWrapper.
function oldExtractBrandWrapper(bibleText: string): { phrase: string | null; viaFallback: boolean } {
  const brandSection = bibleText.match(/(?:brand|signature|recurring|wrapper|outro|opener)[^\n]{0,200}["“']([^"”']{3,50})["”']/i);
  if (brandSection?.[1]) return { phrase: brandSection[1].trim(), viaFallback: false };
  const anyQuoted = bibleText.match(/["“']([^"”']{3,50})["”']/);
  return { phrase: anyQuoted?.[1]?.trim() ?? null, viaFallback: true };
}

async function main() {
  // (1) Audit every active Bible: what would the OLD code have force-injected?
  const bibles = await db.select().from(poetBible).where(eq(poetBible.isActive, true));
  console.log(`==== OLD forced brand-wrapper audit over ${bibles.length} active Bibles ====`);
  let viaFallbackCount = 0;
  for (const b of bibles) {
    const { phrase, viaFallback } = oldExtractBrandWrapper(b.content);
    if (phrase && viaFallback) viaFallbackCount++;
    const tag = !phrase ? "—(none)" : viaFallback ? "⚠ FALLBACK(anyQuoted)" : "✓ brand-section";
    console.log(`  ${b.name.slice(0, 26).padEnd(26)} | ${tag} | "${phrase ?? ""}"`);
  }
  console.log(`  → ${viaFallbackCount}/${bibles.length} would inject a phrase grabbed by the risky anyQuoted fallback (no real brand section).`);

  // (2) Shipped behavior on a real idea (channel with active bible + ai_reference SOP).
  let picked: { chanId: string; bible: typeof bibles[number] } | null = null;
  for (const b of bibles) {
    const [sop] = await db.select().from(clerkSops).where(and(eq(clerkSops.channelId, b.channelId), eq(clerkSops.sopType, "ai_reference"))).limit(1);
    if (sop) { picked = { chanId: b.channelId, bible: b }; break; }
  }
  if (!picked) { console.log("\n(no channel with active bible + ai_reference SOP — skipping shipped run)"); return; }

  const [sop] = await db.select().from(clerkSops).where(and(eq(clerkSops.channelId, picked.chanId), eq(clerkSops.sopType, "ai_reference"))).limit(1);
  const [idea] = await db
    .select({ storyAngle: museIdeas.storyAngle, factsAndData: museIdeas.factsAndData, whySimilar: museIdeas.whySimilar, viralTrigger: museIdeas.viralTrigger, title: museMonitorVideos.title, ch: museMonitorVideos.sourceChannelName })
    .from(museIdeas)
    .leftJoin(museMonitorVideos, eq(museMonitorVideos.id, museIdeas.sourceVideoId))
    .where(eq(museIdeas.channelId, picked.chanId))
    .limit(1);

  const oldWrap = oldExtractBrandWrapper(picked.bible.content);
  console.log(`\n==== SHIPPED writeScriptShort — channel bible "${picked.bible.name}" ====`);
  console.log(`  OLD code would have force-injected: ${oldWrap.viaFallback ? "⚠ " : ""}"${oldWrap.phrase ?? "(none)"}"`);

  const t0 = Date.now();
  const res = await writeScriptShort({
    idea: {
      storyAngle: idea?.storyAngle ?? "用一个反差开场拆解这个话题",
      factsAndData: idea?.factsAndData ?? "（无外部事实，依据 Bible 撰写）",
      whySimilar: idea?.whySimilar ?? "与频道选题契合",
      viralTrigger: idea?.viralTrigger ?? "反差 + 高信息密度",
      sourceTitle: idea?.title ?? "对标视频",
      sourceChannel: idea?.ch ?? "competitor",
    },
    sopText: sop?.contentMd ?? "",
    bibleText: picked.bible.content,
    language: "zh",
    targetWordCount: 1000,
  });
  const sec = Math.round((Date.now() - t0) / 1000);
  const hook = res.scriptText.split(/\[(?:TEASE|ITEM|CTA)/)[0] ?? res.scriptText.slice(0, 400);
  const forcedJunkPresent = oldWrap.viaFallback && oldWrap.phrase ? res.scriptText.includes(oldWrap.phrase) : false;
  console.log(`  ${sec}s | ${res.wordCount} 字`);
  console.log(`  hook head: ${hook.slice(0, 220).replace(/\n/g, " ")}`);
  console.log(`  shipped script contains the OLD anyQuoted phrase in hook? ${forcedJunkPresent ? "yes" : "no ✓ (not force-shoved)"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
