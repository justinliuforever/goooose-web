/**
 * Custom Topic smoke. Covers:
 *   1. extractYoutubeVideoId / extractXhsNoteId (pure unit, edges)
 *   2. fetchReference type="text" (offline, instant)
 *   3. fetchReference type="youtube" (real call, Rick Astley)
 *   4. fetchReference type="youtube" bogus URL → graceful error field
 *   5. fetchReference type="xhs" bogus URL → graceful error field
 *   6. fetchReferences batch with mixed types — partial failures kept with error
 *   7. analyzeTopic end-to-end with realistic Chinese topic + 1 text ref
 *
 * Run: pnpm --filter @singularity/db custom-topic-smoke
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const { extractYoutubeVideoId, extractXhsNoteId, fetchReference, fetchReferences } =
  await import("@singularity/integrations/clients/references");
const { analyzeTopic } = await import("@singularity/domain/services/poet/topic-analyzer");

function header(s: string) {
  console.log(`\n═══ ${s}`);
}

async function testExtractors() {
  header("Test 1: URL extractors (pure unit)");
  const ytCases: Array<[string, string | null]> = [
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=foo&t=42", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/abcdefghijk", "abcdefghijk"],
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://example.com/notyoutube", null],
    ["", null],
  ];
  for (const [url, expected] of ytCases) {
    const got = extractYoutubeVideoId(url);
    const pass = got === expected;
    console.log(`  ${pass ? "✓" : "✗"} yt "${url}" → ${got} (expect ${expected})`);
  }

  // XHS note ids are 24 hex chars; 16-char minimum is allowed by the regex.
  const xhsCases: Array<[string, string | null]> = [
    [
      "https://www.xiaohongshu.com/explore/66c123abc456def789012345",
      "66c123abc456def789012345",
    ],
    [
      "https://www.xiaohongshu.com/discovery/item/66c123abc456def789012345",
      "66c123abc456def789012345",
    ],
    ["66c123abc456def789012345", "66c123abc456def789012345"],
    ["abc123def456", null], // too short
    ["https://www.example.com/abc", null],
  ];
  for (const [url, expected] of xhsCases) {
    const got = extractXhsNoteId(url);
    const pass = got === expected;
    console.log(`  ${pass ? "✓" : "✗"} xhs "${url}" → ${got} (expect ${expected})`);
  }
}

async function testTextRef() {
  header("Test 2: fetchReference type=text (offline)");
  const ref = await fetchReference({
    kind: "text",
    text: "Hello from pasted content",
    title: "Pasted snippet",
  });
  console.log("  type:", ref.type, "(expect text)");
  console.log("  content:", ref.content.slice(0, 50));
  console.log("  has fetchedAt:", !!ref.fetchedAt);
  console.log("  no error:", !ref.error);
}

async function testYoutubeRef() {
  header("Test 3: fetchReference type=youtube (real call, Rick Astley)");
  const t0 = Date.now();
  const ref = await fetchReference({
    kind: "youtube",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  });
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  type=${ref.type} source=${ref.source} content=${ref.content.length} chars`);
  console.log(`  head: "${ref.content.slice(0, 100)}…"`);
  if (ref.error) console.log(`  error: ${ref.error}`);
}

async function testBogusYoutube() {
  header("Test 4: fetchReference type=youtube bogus URL (graceful error)");
  const ref = await fetchReference({
    kind: "youtube",
    url: "https://example.com/not-a-youtube-url",
  });
  console.log(`  type=${ref.type} content=${ref.content.length} chars`);
  console.log(`  has error: ${!!ref.error}`);
  console.log(`  error: ${ref.error}`);
}

async function testBogusXhs() {
  header("Test 5: fetchReference type=xhs bogus URL (graceful error)");
  const ref = await fetchReference({
    kind: "xhs",
    url: "https://example.com/not-xhs",
  });
  console.log(`  type=${ref.type} content=${ref.content.length} chars`);
  console.log(`  has error: ${!!ref.error}`);
  console.log(`  error: ${ref.error}`);
}

async function testBatch() {
  header("Test 6: fetchReferences batch with mixed types");
  const t0 = Date.now();
  const results = await fetchReferences([
    { kind: "text", text: "First pasted content" },
    { kind: "text", text: "Second pasted content" },
    { kind: "youtube", url: "https://example.com/bogus" },
  ]);
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s, got ${results.length} refs`);
  for (const r of results) {
    console.log(`  - type=${r.type} content=${r.content.length} error=${r.error ?? "—"}`);
  }
}

async function testAnalyzeTopic() {
  header("Test 7: analyzeTopic end-to-end (zh)");
  const bible = `TOPIC: 露营装备实测与避坑指南
## 1. CHANNEL DESCRIPTION
本频道专注于户外露营装备的真实测评，强调实测数据 + 真实场景 + 避坑指南。`;
  const sop = `# CONTENT_FORMULA
开头 5 秒强钩子：直接抛出冲突或数字。
# HOOK_TEMPLATES
- "我花了 X 块买了 Y，结果……"`;
  const refs = [
    {
      type: "text",
      title: "EN 3923 testing standard summary",
      content:
        "EN 3923:2019 specifies that camping tent hydrostatic head must be measured under dynamic wind load of 30km/h, not the static lab condition. PU3000 rated tents typically test at PU1500 in dynamic conditions. R-value < 2 sleeping pads lose 60% thermal performance at 0°C.",
    },
  ];
  const t0 = Date.now();
  const analysis = await analyzeTopic({
    topic: "为什么我花了五千块买的露营装备还是冷得睡不着——藏在 R 值背后的厂商话术",
    references: refs,
    bibleText: bible,
    sopText: sop,
    language: "zh",
  });
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // verbatim_facts is intentionally kept in source language so numbers/names
  // aren't corrupted; only the four narrative fields are checked for zh.
  const requireChinese = new Set(["storyAngle", "factsAndData", "whySimilar", "viralTrigger"]);
  for (const [k, v] of Object.entries(analysis)) {
    const text = typeof v === "string" ? v : JSON.stringify(v);
    const isChinese = /[一-鿿]/.test(text);
    const want = requireChinese.has(k);
    const pass = want ? isChinese : true;
    console.log(
      `  ${pass ? "✓" : "✗"} ${k} (${text.length} chars${want ? ", expect zh" : ", source-lang OK"}):`,
    );
    console.log(`     ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`);
  }
}

async function main() {
  await testExtractors();
  await testTextRef();
  await testYoutubeRef();
  await testBogusYoutube();
  await testBogusXhs();
  await testBatch();
  await testAnalyzeTopic();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
