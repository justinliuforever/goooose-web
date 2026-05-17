/**
 * Verify: feed English transcript with language=zh, confirm output is
 * Chinese (analyzer JSON values + a quick SOP sample).
 *
 * Run: pnpm --filter @singularity/db exec tsx scripts/verify-chinese-output.ts
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { generateText } from "ai";
import { createDeepSeek } from "@ai-sdk/deepseek";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const deepseek = createDeepSeek({ apiKey: process.env.DEEPSEEK_API_KEY! });
const pro = deepseek("deepseek-v4-pro");

// English transcript (Rick Astley snippet)
const ENGLISH_TRANSCRIPT = `We're no strangers to love. You know the rules and so do I. A full commitment's what I'm thinking of. You wouldn't get this from any other guy. I just want to tell you how I'm feeling. Got to make you understand. Never gonna give you up. Never gonna let you down. Never gonna run around and desert you.`;

const PROMPT = `IMPORTANT: Write the ENTIRE response in Simplified Chinese (简体中文). All section titles, analysis, explanations, templates, and examples must be in Chinese. Keep proper nouns and technical terms in their original language where appropriate.

You are an expert content analyst. Analyze this content and extract structured data about its scripting techniques.

## Video Information
- **Title:** Never Gonna Give You Up
- **Views:** 1,773,396,483
- **Duration:** 213 seconds

## Full Transcript
${ENGLISH_TRANSCRIPT}

## Instructions

Return a JSON object with these exact keys: opening_hook (str), opening_hook_type (str), framework (str), key_takeaways (str). All values in Chinese.

Return ONLY valid JSON. No markdown code fences.

IMPORTANT: JSON keys must remain in English (opening_hook, opening_hook_type, framework, key_takeaways). Only the VALUES (the strings on the right side) should be in Simplified Chinese.`;

function hasChineseChars(s: string): boolean {
  return /[一-鿿]/.test(s);
}

async function main() {
  console.log("Sending English-transcript prompt to V4 Pro with language=zh wrapper…");
  console.log();
  const t0 = Date.now();
  const result = await generateText({
    model: pro,
    prompt: PROMPT,
    maxOutputTokens: 2048,
    temperature: 0.3,
  });
  console.log(`Took ${(Date.now() - t0) / 1000}s`);
  console.log();
  console.log("=== Raw output ===");
  console.log(result.text);
  console.log();

  // Try to parse and check each value
  const cleaned = result.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(cleaned);
  } catch (e) {
    console.log("⚠ Could not parse JSON:", (e as Error).message);
    return;
  }

  console.log("=== Per-field Chinese check ===");
  for (const [k, v] of Object.entries(json)) {
    const s = String(v);
    const isChinese = hasChineseChars(s);
    const icon = isChinese ? "✓" : "✗";
    console.log(`${icon} ${k} (${isChinese ? "Chinese" : "NOT Chinese"})`);
    console.log(`    "${s.slice(0, 120)}"`);
  }

  // Check keys stayed English
  const keys = Object.keys(json);
  const keysEnglish = keys.every((k) => !hasChineseChars(k));
  console.log();
  console.log(`Keys remain English: ${keysEnglish ? "✓" : "✗"} (${keys.join(", ")})`);
}

main().catch(console.error);
