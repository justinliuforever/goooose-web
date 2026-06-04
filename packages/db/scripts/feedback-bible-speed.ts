// #4 Bible generation speed test. Same real prompt, vary model + maxOutputTokens.
// Measures latency + output completeness to ground the speedup recommendation.
// Run: pnpm --filter @singularity/db exec tsx scripts/feedback-bible-speed.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { generateText } from "ai";
import { buildChannelBiblePrompt } from "@singularity/shared/prompts/poet";
import { llm } from "@singularity/shared/clients/llm";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const prompt = buildChannelBiblePrompt({
  language: "zh",
  ideaText:
    "我想做一个测评徕卡相机和古董相机的口播频道，面向收藏者和摄影发烧友，既讲器材参数和收藏价值，也聊收藏圈的故事和买卖门道，风格专业但带点圈内八卦。",
  channelDescription: "",
});

function hasAllSections(t: string) {
  return (
    /TOPIC:/.test(t) &&
    /CHANNEL DESCRIPTION/.test(t) &&
    /INFORMATION SOURCES/.test(t) &&
    /TOPIC GENERATION FRAMEWORK/.test(t)
  );
}

async function run(label: string, tier: "pro" | "flash", maxOut: number) {
  const t0 = Date.now();
  let text = "";
  let finish = "";
  try {
    const r = await generateText({ model: llm(tier), prompt, maxOutputTokens: maxOut, temperature: 0.4, maxRetries: 1 });
    text = r.text;
    finish = r.finishReason ?? "";
  } catch (e) {
    finish = "ERROR:" + (e as Error).message.slice(0, 60);
  }
  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`${label.padEnd(16)} | ${sec}s | chars=${String(text.length).padStart(5)} | finish=${finish} | complete=${hasAllSections(text)} | empty=${text.length === 0}`);
  writeFileSync(`/tmp/bible_${label}.md`, text);
  return { label, sec, chars: text.length, complete: hasAllSections(text), empty: text.length === 0 };
}

console.log("config           | time | chars | finish | complete | empty");
const results = [];
// current production config
results.push(await run("pro_4096", "pro", 4096));
// lower output cap on Pro
results.push(await run("pro_2800", "pro", 2800));
// flash candidate
results.push(await run("flash_2800", "flash", 2800));
results.push(await run("flash_4096", "flash", 4096));

console.log("\n==== SUMMARY ====");
for (const r of results) console.log(`${r.label}: ${r.sec}s, ${r.chars} chars, complete=${r.complete}, empty=${r.empty}`);
console.log("\nflash_2800 head:\n" + (await import("node:fs")).readFileSync("/tmp/bible_flash_2800.md", "utf8").slice(0, 800));
