import "server-only";

import { createDeepSeek } from "@ai-sdk/deepseek";

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY not set in env");
}

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * Two-tier model strategy for the Singularity stack:
 *
 *   flash — DeepSeek V4 Flash. Use for cheap/simple work where speed matters:
 *           classification, gating decisions, short critiques, idea
 *           generation, drift detection scoring.
 *
 *   pro   — DeepSeek V4 Pro with high reasoning_effort. Use for hard work
 *           where reasoning depth matters: video analyzer (facts +
 *           verbatim_facts), SOP generation, long-form script outline,
 *           section expansion, Bible generation.
 *
 * Both models are reasoning-enabled by default — the response always carries
 * a `reasoning_content` field alongside the answer.
 */
export const flash = deepseek("deepseek-v4-flash");
export const pro = deepseek("deepseek-v4-pro");

export type LlmTier = "flash" | "pro";

export function llm(tier: LlmTier = "flash") {
  return tier === "pro" ? pro : flash;
}
