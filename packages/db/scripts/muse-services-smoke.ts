/**
 * Smoke test for Muse pipeline services (classifier / viral_analyzer / idea_generator).
 * Run: pnpm --filter @singularity/db muse-services-smoke
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const { analyzeViralTrigger, classifyVideo, generateIdeas } = await import(
  "@singularity/shared/services/muse"
);
const { isRealTranscript } = await import("@singularity/shared/schemas/muse");

const TARGET_CHANNEL_DESCRIPTION = `一个面向中国小型创作者的内容教练平台，目标用户是 1-2 人的 XHS + YouTube 团队，
核心交付是 AI 辅助选题、爆款拆解、写稿与改稿。频道风格：严谨、信息密度高、偏教育向但有钩子。`;

const SAMPLE_TRANSCRIPT = `欢迎回到我的频道。今天我们来聊一个所有人都好奇但很少人真正理解的话题：算法是怎么决定你刷到什么的。
我研究了 50 个被推荐到上百万播放的视频，发现一个反直觉的规律——前 3 秒的钩子不是越炸越好。
真正起作用的是「确认偏见」：观众在 0.8 秒内必须确认这个视频跟他自己有关。这跟广告业 70 年代的研究高度一致……
（中间省略）所以下次写脚本，把"为什么这跟你有关"放到第一句，而不是"今天我们来聊"。`;

async function main() {
  console.log("═══ Test 1: classifier (zh) — relevant case");
  const cls1 = await classifyVideo({
    channelDescription: TARGET_CHANNEL_DESCRIPTION,
    title: "算法到底是怎么决定你看到什么的？",
    channelName: "AlgoLab 测试频道",
    views: 1_200_000,
    durationSec: 540,
    transcript: SAMPLE_TRANSCRIPT,
    language: "zh",
  });
  console.log("  relevant:", cls1.relevant);
  console.log("  topic_classification:", cls1.topic_classification);
  console.log("  rejection_reason:", cls1.rejection_reason);

  console.log("\n═══ Test 2: classifier (zh) — short clip should still default to relevant");
  const cls2 = await classifyVideo({
    channelDescription: TARGET_CHANNEL_DESCRIPTION,
    title: "30 秒搞定的事",
    channelName: "Short Channel",
    views: 100,
    durationSec: 25,
    transcript: null,
    language: "zh",
  });
  console.log("  relevant:", cls2.relevant);
  console.log("  topic_classification:", cls2.topic_classification);

  console.log("\n═══ Test 3: isRealTranscript gating");
  console.log("  null →", isRealTranscript(null), "(expect false)");
  console.log("  short →", isRealTranscript("仅一句话。"), "(expect false)");
  console.log("  warning marker →", isRealTranscript("[WARNING: Video transcription failed] something"), "(expect false)");
  console.log("  good →", isRealTranscript(SAMPLE_TRANSCRIPT), "(expect true)");

  console.log("\n═══ Test 4: viral_trigger (zh)");
  const trigger = await analyzeViralTrigger({
    channelDescription: TARGET_CHANNEL_DESCRIPTION,
    title: "算法到底是怎么决定你看到什么的？",
    channelName: "AlgoLab 测试频道",
    views: 1_200_000,
    durationSec: 540,
    transcript: SAMPLE_TRANSCRIPT,
    language: "zh",
  });
  console.log(`  (${trigger.length} chars):`);
  console.log(`  ${trigger.slice(0, 400)}${trigger.length > 400 ? "…" : ""}`);

  console.log("\n═══ Test 5: idea_generation (zh, 3 ideas)");
  const { ideas } = await generateIdeas({
    channelDescription: TARGET_CHANNEL_DESCRIPTION,
    title: "算法到底是怎么决定你看到什么的？",
    channelName: "AlgoLab 测试频道",
    views: 1_200_000,
    viralTrigger: trigger,
    numIdeas: 3,
    language: "zh",
  });
  console.log(`  parsed ${ideas.length} ideas`);
  ideas.forEach((idea, i) => {
    console.log(`\n  --- Idea ${i + 1} ---`);
    console.log(`  story_angle: ${idea.story_angle.slice(0, 120)}`);
    console.log(`  facts_and_data: ${idea.facts_and_data.slice(0, 120)}`);
    console.log(`  why_similar: ${idea.why_similar.slice(0, 120)}`);
  });

  const allChinese = ideas.every((i) => /[一-鿿]/.test(i.story_angle));
  console.log(`\nAll story_angles contain Chinese chars: ${allChinese ? "✓" : "✗"}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
