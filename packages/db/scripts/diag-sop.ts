import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { clerkSops, clerkVideos, pipelineRuns } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);

const sectionMarkers = [
  "Table of Contents",
  "Master Formula",
  "Section 1",
  "Section 2",
  "Section 3",
  "Section 4",
  "Section 5",
  "5.1",
  "5.2",
  "Section 6",
  "6.1",
  "6.2",
  "Section 7",
  "7.1",
  "7.2",
  "[m:",
  "Cover",
  "Diagnostic",
  "ITEM_TEMPLATE",
  "Storytelling",
  "Retention",
];

try {
  const [latest] = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.agent, "clerk"))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);
  if (!latest) throw new Error("no run");

  console.log(`=== Run ${latest.id} (${latest.status}) ===`);
  const sops = await db
    .select()
    .from(clerkSops)
    .where(eq(clerkSops.runId, latest.id))
    .orderBy(desc(clerkSops.generatedAt));

  for (const s of sops) {
    console.log(`\n■ ${s.sopType} | ${s.contentMd?.length ?? 0} chars`);
    const md = s.contentMd ?? "";
    const hits = sectionMarkers.map((m) => ({ marker: m, count: (md.match(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length }));
    console.log("  Krista markers:");
    for (const h of hits) {
      const tag = h.count > 0 ? "✓" : "✗";
      console.log(`    ${tag} ${h.marker}: ${h.count}`);
    }
    console.log(`  First 600 chars:\n${md.slice(0, 600)}`);
    console.log(`  ...`);
  }

  const vids = await db
    .select({
      id: clerkVideos.platformVideoId,
      title: clerkVideos.title,
      framework: clerkVideos.framework,
      coverDiagnosis: clerkVideos.coverDiagnosis,
      titleSuggestions: clerkVideos.coverTitleSuggestions,
      scriptStructure: clerkVideos.scriptStructure,
    })
    .from(clerkVideos)
    .where(eq(clerkVideos.runId, latest.id))
    .limit(3);
  console.log("\n=== Sample analyzed videos ===");
  for (const v of vids) {
    console.log(`\n■ ${v.title}`);
    console.log(`  framework: ${v.framework?.slice(0, 150) ?? "—"}`);
    console.log(`  coverDiagnosis: ${v.coverDiagnosis?.slice(0, 150) ?? "—"}`);
    console.log(`  titleSuggestions: ${v.titleSuggestions?.join(" | ") ?? "—"}`);
    console.log(`  scriptStructure head: ${v.scriptStructure?.slice(0, 250) ?? "—"}`);
  }
} finally {
  await client.end();
}
