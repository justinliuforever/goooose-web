import { createDeepSeek } from "@ai-sdk/deepseek";

if (!process.env.DEEPSEEK_API_KEY) {
  throw new Error("DEEPSEEK_API_KEY not set in env");
}

const deepseek = createDeepSeek({
  apiKey: process.env.DEEPSEEK_API_KEY,
});

/**
 * Two-tier DeepSeek model strategy:
 *
 *   flash — V4 Flash. Cheap/fast: classification, gating, short critique.
 *   pro   — V4 Pro with reasoning. Deep work: analyzer, SOP gen, long-form.
 *
 * Both models are reasoning-enabled by default; response carries
 * `reasoning_content` alongside the answer.
 */
export const flash = deepseek("deepseek-v4-flash");
export const pro = deepseek("deepseek-v4-pro");

export type LlmTier = "flash" | "pro";

export function llm(tier: LlmTier = "flash") {
  return tier === "pro" ? pro : flash;
}
