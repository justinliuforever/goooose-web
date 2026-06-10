// Real-LLM smoke for the writer closure: a disputed fact (M4 "1964") must NOT reach the
// final script as a hard value. Runs the full writeScript (short path + grounding).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { writeScript } from "@singularity/shared/services/poet/script-writer";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const leicaText = `Leica M Series Film Cameras Overview
- M3: produced 1954 to 1966; viewfinder 0.91x.
- M4: produced between 1964 to 1975; faster film loading; framelines 35/135, 50, 90.
- M6: produced 1984 to 2002; built-in TTL meter.`;

const factChecks = [
  { fact: "M3: produced 1954 to 1966; viewfinder 0.91x", src: "Leica M Series Film Cameras Overview", status: "verified" as const },
  { fact: "M4: produced between 1964 to 1975", src: "Leica M Series Film Cameras Overview", status: "disputed" as const, note: "徕卡 M4 公认 1967 年起，非 1964" },
  { fact: "M6: produced 1984 to 2002; built-in TTL meter", src: "Leica M Series Film Cameras Overview", status: "verified" as const },
];

const t0 = Date.now();
const draft = await writeScript({
  idea: {
    storyAngle: "用三台代表机 M3、M4、M6 串起徕卡 M 系列胶片机的演变：取景、装片、测光三次关键升级，以及它们今天的二手价值。",
    factsAndData: "- M3 取景 0.91x（1954-1966）\n- M4 革新快速装片（生产至 1975）\n- M6 内置 TTL 测光（1984-2002）",
    whySimilar: "符合频道器材深度解析定位。",
    viralTrigger: "老相机为什么越用越保值。",
    sourceTitle: "徕卡 M 系列胶片机全解析",
    sourceChannel: "Custom topic",
  },
  sopText: "[No SOP reference available]",
  bibleText: "频道定位：面向摄影爱好者的器材深度解析，讲历史、参数与二手行情，语气专业但不端着。",
  language: "zh",
  references: [{ type: "text", title: "Leica M Series Film Cameras Overview", content: leicaText }],
  targetWordCount: 320,
  verbatimFacts: leicaText,
  factChecks,
});
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

const text = draft.scriptText;
console.log(`\nwriteScript took ${elapsed}s, path=${draft.path}, ${text.length} chars`);
console.log(`mentions M4: ${text.includes("M4")}`);
console.log(`contains the wrong year "1964": ${text.includes("1964")}  <-- must be false`);
console.log(`mentions 1967: ${text.includes("1967")}`);
console.log("\n=== M4 sentence(s) ===");
for (const s of text.split(/(?<=[。！？\n])/)) if (s.includes("M4") || s.includes("1964") || s.includes("1967")) console.log("  »", s.trim());
console.log("\n=== full script ===\n" + text);
