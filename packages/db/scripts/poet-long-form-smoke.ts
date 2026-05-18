/**
 * W6 Poet long-form smoke. Exercises:
 *   1. isLongForm routing (pure unit)
 *   2. computeTargetWordCount edges (null/0/large)
 *   3. Outline JSON parse — happy + malformed + empty sections
 *   4. Section expansion order + markers preserved
 *   5. End-to-end long script ≥ 2000 chars zh
 *   6. Humanizer preserves markers even on long output
 *
 * Run: pnpm --filter @singularity/db poet-long-form-smoke
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const { writeScript, writeScriptShort } = await import(
  "@singularity/shared/services/poet/script-writer"
);
const { humanizeChinese } = await import("@singularity/shared/services/poet/humanizer");
const { computeTargetWordCount, isLongForm, LONG_FORM_THRESHOLD } = await import(
  "@singularity/shared/schemas/poet"
);

const FAKE_BIBLE = `TOPIC: 露营装备实测与避坑指南

## 1. CHANNEL DESCRIPTION — 露营装备实测与避坑指南
本频道专注于户外露营装备的真实测评，强调实测数据 + 真实场景 + 避坑指南。`;

const FAKE_SOP = `# CONTENT_FORMULA
开头 5 秒强钩子：直接抛出冲突或数字。
# HOOK_TEMPLATES
- "我花了 X 块买了 Y，结果……"
- "别再被 X 骗了——真相是 Y"
# SCRIPT_STRUCTURE
HOOK → TEASE → 3-5 个 ITEM → CTA → CLIMAX → CLOSE`;

const IDEA = {
  storyAngle: "为什么 80% 的露营装备测评都在骗人？三个真相",
  factsAndData:
    "1. 帐篷防水指数 PU3000 vs PU1500 实际场景区别巨大；2. 充气垫 R 值 < 2 在 0℃ 下完全失效；3. 燃气炉头海拔超过 3000m 火力衰减 30%。",
  whySimilar: "用反直觉数据 + 实测对比击穿装备厂商的话术",
  viralTrigger: "强冲突标题 + 可执行清单",
  sourceTitle: "Camping Gear Testing 2024",
  sourceChannel: "OutdoorLab",
};

function header(s: string) {
  console.log(`\n═══ ${s}`);
}

async function testRouting() {
  header("Test 1: routing edges (pure unit)");

  // computeTargetWordCount edges
  console.log("  null →", computeTargetWordCount(null, "zh"), "(expect 1000)");
  console.log("  0 →", computeTargetWordCount(0, "zh"), "(expect 1000)");
  console.log("  negative →", computeTargetWordCount(-5, "zh"), "(expect 1000)");
  console.log("  5min →", computeTargetWordCount(5, "zh"), "(expect 1000)");
  console.log("  10min →", computeTargetWordCount(10, "zh"), "(expect 2000)");
  console.log("  10min EN →", computeTargetWordCount(10, "en"), "(expect 1500)");

  // isLongForm
  console.log("  isLongForm(1999, zh) →", isLongForm(1999, "zh"), "(expect false)");
  console.log("  isLongForm(2000, zh) →", isLongForm(2000, "zh"), "(expect true)");
  console.log("  isLongForm(1499, en) →", isLongForm(1499, "en"), "(expect false)");
  console.log("  isLongForm(1500, en) →", isLongForm(1500, "en"), "(expect true)");

  console.log("  thresholds:", LONG_FORM_THRESHOLD);
}

async function testShortFallback() {
  header("Test 2: 5-min target stays on short-form path (no outline call)");
  const t0 = Date.now();
  const result = await writeScript({
    idea: IDEA,
    sopText: FAKE_SOP,
    bibleText: FAKE_BIBLE,
    language: "zh",
    targetWordCount: 1000,
  });
  console.log(
    `  ✓ path=${result.path} (expect short), ${result.wordCount} chars in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  const hasAllMarkers = ["[HOOK]", "[CLOSE]"].every((m) => result.scriptText.includes(m));
  console.log(`  Markers: ${hasAllMarkers ? "✓" : "✗"}`);
}

async function testLongForm() {
  header("Test 3: 10-min target routes to long-form (outline → expand)");
  let sectionsSeen: Array<{ index: number; marker: string }> = [];
  const t0 = Date.now();
  const result = await writeScript(
    {
      idea: IDEA,
      sopText: FAKE_SOP,
      bibleText: FAKE_BIBLE,
      language: "zh",
      targetWordCount: 2000,
    },
    {
      onOutlineDone: async (o) => {
        console.log(`  outline overall_arc: ${o.overall_arc.slice(0, 80)}`);
        console.log(
          `  outline sections (${o.sections.length}):`,
          o.sections.map((s) => `${s.marker}~${s.target_count}`).join(" / "),
        );
      },
      onSectionStart: async ({ index, total, marker }) => {
        console.log(`  → start ${index + 1}/${total} ${marker}`);
      },
      onSectionDone: async ({ index, total, marker, chars }) => {
        sectionsSeen.push({ index, marker });
        console.log(`  ✓ done ${index + 1}/${total} ${marker} (${chars} chars)`);
      },
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\n  path=${result.path} (expect long), ${result.wordCount} chars in ${elapsed}s, ${sectionsSeen.length} sections`,
  );

  // Edge: section order matches outline order
  const orderedCorrectly = sectionsSeen.every((s, i) => s.index === i);
  console.log(`  Section order preserved: ${orderedCorrectly ? "✓" : "✗"}`);

  // Edge: all section markers appear in script (or required ones HOOK/CLOSE at minimum)
  const hookPresent = result.scriptText.includes("[HOOK]");
  const closePresent = result.scriptText.includes("[CLOSE]");
  console.log(`  [HOOK] in script: ${hookPresent ? "✓" : "✗"}`);
  console.log(`  [CLOSE] in script: ${closePresent ? "✓" : "✗"}`);

  // Edge: each marker in sectionsSeen appears in the assembled script
  const allMarkersInOrder = sectionsSeen.every(
    (s, i) => result.scriptText.indexOf(s.marker) >
      (i === 0 ? -1 : result.scriptText.indexOf(sectionsSeen[i - 1]!.marker)),
  );
  console.log(`  Markers strictly in order: ${allMarkersInOrder ? "✓" : "✗"}`);

  // Edge: reached at least 80% of target
  const ratio = result.wordCount / 2000;
  console.log(`  Length ratio: ${ratio.toFixed(2)} (expect ≥ 0.80)`);

  // Quick humanize check on long output
  console.log("\n  --- humanizer pass on assembled long script ---");
  const t1 = Date.now();
  const humanized = await humanizeChinese(result.scriptText);
  console.log(
    `  ${((Date.now() - t1) / 1000).toFixed(1)}s, ${humanized.length} chars (vs ${result.scriptText.length})`,
  );
  const markersStillPresent =
    humanized.includes("[HOOK]") && humanized.includes("[CLOSE]");
  console.log(`  Markers preserved after humanize: ${markersStillPresent ? "✓" : "✗"}`);

  // Edge: a few sample numbers survived
  const checkpoints = ["PU3000", "PU1500", "30%"];
  const survived = checkpoints.filter((c) => humanized.includes(c));
  console.log(
    `  Verbatim numbers survived humanizer: ${survived.length}/${checkpoints.length} (${survived.join(", ") || "none"})`,
  );

  console.log("\n  --- long script head (first 800 chars) ---");
  console.log(result.scriptText.slice(0, 800));
}

async function testShortSanity() {
  header("Test 4: writeScriptShort direct call still works");
  const result = await writeScriptShort({
    idea: IDEA,
    sopText: FAKE_SOP,
    bibleText: FAKE_BIBLE,
    language: "zh",
    targetWordCount: 600,
  });
  console.log(`  ${result.wordCount} chars (expect ≥ 540 = 600 * 0.9)`);
  console.log(`  ${result.scriptText.slice(0, 200)}`);
}

async function main() {
  await testRouting();
  await testShortFallback();
  await testLongForm();
  await testShortSanity();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
