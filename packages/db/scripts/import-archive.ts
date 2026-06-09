/**
 * Import archived xlsx data into Supabase, all rows bound to a single user.
 *
 * Run: pnpm --filter @singularity/db import-archive
 *
 * Caveats:
 * - xlsx export truncates every long-text cell to ~301 chars (trailing "…").
 *   Affected: poet_bible.content, clerk_sops.content_md, custom_topic.references_json,
 *   most clerk video analysis fields, etc. Re-run Clerk/Poet pipelines after W3-W5
 *   to rebuild full content from the source videos.
 * - poet_scripts sheet skipped: script_text is not in xlsx (only file_path
 *   on the old machine) and rows use two inconsistent column layouts.
 *   Re-generate scripts via Poet after W5.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as XLSX from "xlsx";

import {
  channels,
  clerkSops,
  clerkVideos,
  museIdeas,
  museMonitorVideos,
  poetBible,
  poetCustomTopics,
  users,
  type CustomTopicReference,
} from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL not set in .env.local");
}

const TARGET_EMAIL = "justinliuforever@gmail.com";
const XLSX_PATH = resolve(__dirname, "../../../Singularity_Data_20260516_1255.xlsx");

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "None") return null;
  return s;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || v === "None") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    return v === "1" || v.toLowerCase() === "true";
  }
  return false;
};

const boolOrNull = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === "" || v === "None") return null;
  return bool(v);
};

const ts = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const tsOrNow = (v: unknown): Date => ts(v) ?? new Date();

function rows(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found`);
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
}

async function main() {
  console.log(`Loading ${XLSX_PATH}`);
  const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });

  const client = postgres(DATABASE_URL!, { prepare: false });
  const db = drizzle(client);

  const [user] = await db.select().from(users).where(eq(users.email, TARGET_EMAIL));
  if (!user) {
    throw new Error(
      `User ${TARGET_EMAIL} not found. Sign in via /api/auth/sign-in first to create the row.`,
    );
  }
  console.log(`Target user: ${user.email} (id=${user.id})`);

  await db.transaction(async (tx) => {
    console.log("Clearing existing channels for this user (cascade)…");
    await tx.delete(channels).where(eq(channels.userId, user.id));

    // Collect every channel slug that appears in any agent sheet.
    const allSheets = [
      "Clerk – Videos",
      "Clerk – SOPs",
      "Muse – Monitor Videos",
      "Muse – Ideas",
      "Poet – Bible",
      "Poet – Custom Topics",
    ];
    const channelSlugs = new Set<string>();
    for (const sheetName of allSheets) {
      const data = rows(wb, sheetName);
      for (let i = 1; i < data.length; i++) {
        const slug = str(data[i]?.[0]);
        if (slug) channelSlugs.add(slug);
      }
    }

    // Channels
    const channelIdBySlug = new Map<string, string>();
    const channelInserts = [...channelSlugs].map((slug) => {
      const id = randomUUID();
      channelIdBySlug.set(slug, id);
      return {
        id,
        userId: user.id,
        name: slug,
        slug,
        platform: "youtube" as const,
        platformUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(slug)}`,
        competitors: [] as never[],
      };
    });
    if (channelInserts.length) await tx.insert(channels).values(channelInserts);
    console.log(`  channels: ${channelInserts.length}`);

    // Clerk videos
    const clerkVideoData = rows(wb, "Clerk – Videos");
    const clerkVideoInserts = [];
    for (let i = 1; i < clerkVideoData.length; i++) {
      const r = clerkVideoData[i];
      const channelId = channelIdBySlug.get(str(r[0]) ?? "");
      if (!channelId) continue;
      const platformVideoId = str(r[2]);
      if (!platformVideoId) continue;
      clerkVideoInserts.push({
        id: randomUUID(),
        channelId,
        platformVideoId,
        title: str(r[3]) ?? "Untitled",
        url: str(r[4]) ?? `https://www.youtube.com/watch?v=${platformVideoId}`,
        views: num(r[5]),
        durationSec: num(r[6]),
        thumbnailUrl: str(r[7]),
        sourceChannelName: str(r[8]),
        sourceChannelId: str(r[9]),
        transcript: str(r[10]),
        thumbnailDescription: str(r[11]),
        thumbnailWhyItWorks: str(r[12]),
        openingHook: str(r[13]),
        openingHookType: str(r[14]),
        hooksThroughout: str(r[15]),
        allHookTypes: str(r[16]),
        textHook: str(r[17]),
        framework: str(r[18]),
        openingStructure: str(r[19]),
        scriptStructure: str(r[20]),
        storytellingFramework: str(r[21]),
        rehooksUsed: str(r[22]),
        retentionPattern: str(r[23]),
        ctaPlacement: str(r[24]),
        keyTakeaways: str(r[25]),
        verbatimFacts: null,
        analyzedAt: ts(r[26]),
      });
    }
    if (clerkVideoInserts.length) await tx.insert(clerkVideos).values(clerkVideoInserts);
    console.log(`  clerk_videos: ${clerkVideoInserts.length}`);

    // Clerk SOPs
    const sopIdByChannelOld = new Map<string, string>();
    const sopData = rows(wb, "Clerk – SOPs");
    const sopInserts = [];
    for (let i = 1; i < sopData.length; i++) {
      const r = sopData[i];
      const channelSlug = str(r[0]);
      const channelId = channelIdBySlug.get(channelSlug ?? "");
      if (!channelId || !channelSlug) continue;
      const oldId = num(r[1]);
      const sopType = (str(r[2]) ?? "human") as "human" | "ai_reference" | "hottest";
      const id = randomUUID();
      if (oldId !== null) sopIdByChannelOld.set(`${channelSlug}/${oldId}`, id);
      sopInserts.push({
        id,
        channelId,
        sopType,
        language: str(r[3]) ?? "zh",
        contentMd: str(r[5]) ?? "",
        generatedAt: tsOrNow(r[6]),
        updatedAt: tsOrNow(r[6]),
      });
    }
    if (sopInserts.length) await tx.insert(clerkSops).values(sopInserts);
    console.log(`  clerk_sops: ${sopInserts.length}`);

    // Muse monitor videos
    const museVideoIdByChannelPlatform = new Map<string, string>();
    const museVideoData = rows(wb, "Muse – Monitor Videos");
    const museVideoInserts = [];
    for (let i = 1; i < museVideoData.length; i++) {
      const r = museVideoData[i];
      const channelSlug = str(r[0]);
      const channelId = channelIdBySlug.get(channelSlug ?? "");
      if (!channelId || !channelSlug) continue;
      const platformVideoId = str(r[2]);
      if (!platformVideoId) continue;
      const id = randomUUID();
      museVideoIdByChannelPlatform.set(`${channelSlug}/${platformVideoId}`, id);
      museVideoInserts.push({
        id,
        channelId,
        platformVideoId,
        title: str(r[3]) ?? "Untitled",
        url: str(r[4]) ?? `https://www.youtube.com/watch?v=${platformVideoId}`,
        sourceChannelName: str(r[5]),
        publishedAt: ts(r[6]),
        durationSec: num(r[7]),
        transcript: str(r[8]),
        relevant: boolOrNull(r[9]),
        topicClassification: str(r[10]),
        rejectionReason: str(r[11]),
        processedAt: tsOrNow(r[12]),
      });
    }
    if (museVideoInserts.length) await tx.insert(museMonitorVideos).values(museVideoInserts);
    console.log(`  muse_monitor_videos: ${museVideoInserts.length}`);

    // Muse ideas — source_video_id in xlsx holds the platform_video_id string, not int FK
    const museIdeaData = rows(wb, "Muse – Ideas");
    const museIdeaInserts = [];
    for (let i = 1; i < museIdeaData.length; i++) {
      const r = museIdeaData[i];
      const channelSlug = str(r[0]);
      const channelId = channelIdBySlug.get(channelSlug ?? "");
      if (!channelId || !channelSlug) continue;
      const sourcePlatformVideoId = str(r[2]);
      const sourceVideoId = sourcePlatformVideoId
        ? museVideoIdByChannelPlatform.get(`${channelSlug}/${sourcePlatformVideoId}`) ?? null
        : null;
      museIdeaInserts.push({
        id: randomUUID(),
        channelId,
        sourceVideoId,
        ideaNumber: num(r[3]) ?? 0,
        storyAngle: str(r[4]),
        factsAndData: str(r[5]),
        whySimilar: str(r[6]),
        viralTrigger: str(r[7]),
        approved: bool(r[8]),
        scripted: bool(r[9]),
        // r[10] = script_id (skipped, poet_scripts not imported)
        generatedAt: tsOrNow(r[11]),
        approvedAt: ts(r[12]),
      });
    }
    if (museIdeaInserts.length) await tx.insert(museIdeas).values(museIdeaInserts);
    console.log(`  muse_ideas: ${museIdeaInserts.length}`);

    // Poet Bible
    const bibleIdByChannelOld = new Map<string, string>();
    const bibleData = rows(wb, "Poet – Bible");
    const bibleInserts = [];
    for (let i = 1; i < bibleData.length; i++) {
      const r = bibleData[i];
      const channelSlug = str(r[0]);
      const channelId = channelIdBySlug.get(channelSlug ?? "");
      if (!channelId || !channelSlug) continue;
      const oldId = num(r[1]);
      const id = randomUUID();
      if (oldId !== null) bibleIdByChannelOld.set(`${channelSlug}/${oldId}`, id);
      bibleInserts.push({
        id,
        channelId,
        name: str(r[6]) ?? "Untitled bible",
        content: str(r[2]) ?? "",
        sourceIdea: str(r[3]),
        isActive: bool(r[5]),
        generatedAt: tsOrNow(r[4]),
        updatedAt: tsOrNow(r[4]),
      });
    }
    if (bibleInserts.length) await tx.insert(poetBible).values(bibleInserts);
    console.log(`  poet_bible: ${bibleInserts.length}`);

    // Poet Custom Topics
    const customTopicData = rows(wb, "Poet – Custom Topics");
    const customTopicInserts = [];
    for (let i = 1; i < customTopicData.length; i++) {
      const r = customTopicData[i];
      const channelSlug = str(r[0]);
      const channelId = channelIdBySlug.get(channelSlug ?? "");
      if (!channelId || !channelSlug) continue;

      // references_json may be truncated mid-JSON by xlsx export — parse defensively.
      let references: CustomTopicReference[] = [];
      const refRaw = str(r[3]);
      if (refRaw) {
        try {
          const parsed: unknown = JSON.parse(refRaw);
          if (Array.isArray(parsed)) {
            references = parsed
              .map((ref) => {
                const obj = ref as Record<string, unknown>;
                const type = String(obj.type ?? obj.kind ?? "text");
                const kind: CustomTopicReference["kind"] =
                  type === "youtube" ? "youtube" : type === "xhs" ? "xhs" : "text";
                return {
                  kind,
                  url: obj.url ? String(obj.url) : undefined,
                  text: obj.text ? String(obj.text) : undefined,
                  title: obj.title ? String(obj.title) : undefined,
                };
              })
              .filter((ref) => ref.kind);
          }
        } catch {
          // truncated JSON — leave references empty
        }
      }

      // Two row layouts exist in the xlsx export. The newer one (post 2026-05-15)
      // adds a verbatim_facts column at c7. Detect by checking whether c10 is a
      // known status string (new layout) or shifted (old layout, status at c9).
      const STATUS_VALUES = new Set(["draft", "analyzed", "scripted"]);
      const hasVerbatim = STATUS_VALUES.has(String(r[9] ?? "").trim());
      const col = hasVerbatim
        ? {
            verbatim: 6,
            whySimilar: 7,
            viralTrigger: 8,
            status: 9,
            bibleId: 10,
            sopId: 11,
            language: 12,
            durationMin: 13,
            targetWords: 14,
            createdAt: 16,
            updatedAt: 17,
          }
        : {
            verbatim: -1,
            whySimilar: 6,
            viralTrigger: 7,
            status: 8,
            bibleId: 9,
            sopId: 10,
            language: 11,
            durationMin: 12,
            targetWords: 13,
            createdAt: 15,
            updatedAt: 16,
          };

      const bibleOldId = num(r[col.bibleId]);
      const sopOldId = num(r[col.sopId]);
      const bibleId =
        bibleOldId !== null ? bibleIdByChannelOld.get(`${channelSlug}/${bibleOldId}`) ?? null : null;
      const sopId =
        sopOldId !== null ? sopIdByChannelOld.get(`${channelSlug}/${sopOldId}`) ?? null : null;
      const status = (str(r[col.status]) ?? "draft") as "draft" | "analyzed" | "scripted";

      customTopicInserts.push({
        id: randomUUID(),
        channelId,
        topic: str(r[2]) ?? "Untitled topic",
        references,
        storyAngle: str(r[4]),
        factsAndData: str(r[5]),
        verbatimFacts: col.verbatim >= 0 ? str(r[col.verbatim]) : null,
        whySimilar: str(r[col.whySimilar]),
        viralTrigger: str(r[col.viralTrigger]),
        status,
        bibleId,
        sopId,
        language: (str(r[col.language]) ?? "zh") as "zh" | "en",
        durationSeconds: (() => { const m = num(r[col.durationMin]); return m == null ? null : m * 60; })(),
        targetWordCount: num(r[col.targetWords]),
        createdAt: tsOrNow(r[col.createdAt]),
        updatedAt: tsOrNow(r[col.updatedAt]),
      });
    }
    if (customTopicInserts.length) await tx.insert(poetCustomTopics).values(customTopicInserts);
    console.log(`  poet_custom_topics: ${customTopicInserts.length}`);
  });

  console.log("\nVerifying row counts in database:");
  const tables = [
    { name: "channels", q: channels },
    { name: "clerk_videos", q: clerkVideos },
    { name: "clerk_sops", q: clerkSops },
    { name: "muse_monitor_videos", q: museMonitorVideos },
    { name: "muse_ideas", q: museIdeas },
    { name: "poet_bible", q: poetBible },
    { name: "poet_custom_topics", q: poetCustomTopics },
  ];
  for (const t of tables) {
    const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(t.q);
    console.log(`  ${t.name}: ${row?.c ?? 0}`);
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
