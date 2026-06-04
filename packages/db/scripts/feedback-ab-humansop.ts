// Targeted A/B on the HUMAN SOP prompt — the prompt that actually coins
// 签名式动作 / 认知基模 / 社会仪式CTA in production. Same synthetic videosData,
// only the wrapper differs. Run:
// pnpm --filter @singularity/db exec tsx scripts/feedback-ab-humansop.ts
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { buildHumanSopPrompt } from "@singularity/shared/prompts/clerk";
import { generateTextWithFallback } from "@singularity/shared/clients/llm";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const IMPROVED_WRAPPER = (inner: string) => `用简体中文输出全文。这是给中国内容创作者看的实战手册，必须读起来像一个资深中文编导在讲话，不能有翻译腔或 AI 腔。

## 术语对照（按下面的说法写，禁止直译生造词）
- call to action / CTA → 「引导动作」或直接「CTA」；禁止「社会仪式 CTA」
- signature move → 「IP 标志性动作」；禁止「签名式动作」
- theme / thematic cluster → 「常见主题」或「核心话题」；禁止「主题聚类」
- pattern interrupt / cognitive schema / "bomb" → 「黄金前 3 秒钩子」「打断刷视频的惯性」「完播率痛点」「避免观众划走」；禁止「认知基模」「炸弹」「阻止滑动」
- hook → 钩子；open loop → 留扣子 / 悬念；rehook → 二次抓人；reframe → 换个说法 / 重新定义
- retention → 完播 / 留人；specificity spike → 具体细节抓人点；payload → 干货 / 正片；setup → 铺垫；beat → 节奏段
- 其它英文行话一律换成中文创作者圈通用说法；专有名词、品牌名、逐字引用、[m:ss] 时间戳保持原样。

## 写法要求（去翻译腔 / 去 AI 腔）
- 不要虚化动词：别用「进行 / 加以 / 予以 / 给予 + 名词」，直接用动词。
- 少用被动「被」，改主动。
- 删掉八股套话：「值得注意的是」「总而言之」「众所周知」「……之一」。
- 短句、口语化；不要名词堆叠长句。
- 介词别硬译：of / about / as 不要一律译成「关于 / 对于」。
- 不用 emoji，不写「让我们一起」「希望对你有帮助」「好的，以下是」这类客套与复述指令。

${inner}`;

const videosData = `### Video 1: "I quit my $300k job to make YouTube videos"
- views: 2,400,000
- opening_hook: "[0:00] Three months ago I walked into my boss's office and quit the best-paying job I'll ever have."
- hooks_throughout: "[2:14] But here's the part nobody tells you...", "[5:40] And that's when everything fell apart."
- framework: confession → stakes → turning point → lesson → call to subscribe
- signature elements: self-deprecating asides, dollar amounts dropped constantly, a recurring "let's be real" phrase
- cta_placement: "[9:30] If you've ever thought about doing the same, the link's below."

### Video 2: "Why your morning routine is ruining your day"
- views: 1,800,000
- opening_hook: "[0:00] Everything you've been told about morning routines is backwards."
- hooks_throughout: "[1:50] Wait until you see what the data actually says", "[4:10] number three will surprise you"
- framework: bold claim → myth-busting list → reframe → CTA
- signature elements: pattern-break B-roll cuts, a catchphrase "stay with me", numbered countdown
- cta_placement: "[8:00] comment your routine below"`;

const baseArgs = {
  channelName: "Demo Creator",
  videoCount: 2,
  totalViews: 4_200_000,
  videosData,
  date: "2026-06-02",
};

const v0Prompt = buildHumanSopPrompt({ ...baseArgs, language: "zh" });
const innerEn = buildHumanSopPrompt({ ...baseArgs, language: "en" });
const v1Prompt = IMPROVED_WRAPPER(innerEn);

const FLAGGED = ["社会仪式", "签名式", "认知基模", "基模", "主题聚类", "炸弹", "阻止滑动"];
const AITONE = ["好的，以下", "以下是根据", "希望", "总而言之", "值得注意的是", "综上所述", "首先，", "其次，"];
function count(text: string, markers: string[]) {
  const out: Record<string, number> = {};
  let total = 0;
  for (const m of markers) {
    const n = text.split(m).length - 1;
    if (n > 0) { out[m] = n; total += n; }
  }
  return { out, total };
}

async function gen(label: string, prompt: string) {
  const t0 = Date.now();
  const r = await generateTextWithFallback({ prompt, maxOutputTokens: 5000, temperature: 0.4, maxRetries: 2 });
  const sec = Math.round((Date.now() - t0) / 1000);
  const flagged = count(r.text, FLAGGED);
  const ai = count(r.text, AITONE);
  console.log(`\n==== ${label} ====`);
  console.log(`chars=${r.text.length} time=${sec}s tier=${r.usedTier} finish=${r.finishReason}`);
  console.log(`coinages total=${flagged.total}`, JSON.stringify(flagged.out));
  console.log(`AI-tone total=${ai.total}`, JSON.stringify(ai.out));
  writeFileSync(`/tmp/hsop_${label}.md`, r.text);
  return { text: r.text, flagged, ai };
}

const v0 = await gen("V0_current", v0Prompt);
const v1 = await gen("V1_improved", v1Prompt);
console.log("\n==== SUMMARY (human SOP) ====");
console.log(`coinages: V0=${v0.flagged.total} -> V1=${v1.flagged.total}`);
console.log(`AI-tone:  V0=${v0.ai.total} -> V1=${v1.ai.total}`);
console.log("\nV0 head:\n" + v0.text.slice(0, 600));
console.log("\nV1 head:\n" + v1.text.slice(0, 600));
