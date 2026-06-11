// English scripts skip this pass (no English variant in archive).

import { generateText } from "ai";

import { llm } from "../../clients/llm";
import { buildChineseHumanizerPrompt } from "../../prompts/poet";

export async function humanizeChinese(scriptText: string, maxChars?: number): Promise<string> {
  try {
    const result = await generateText({
      model: llm("pro"),
      prompt: buildChineseHumanizerPrompt(scriptText, maxChars),
      temperature: 0.6,
      maxOutputTokens: 16384,
      maxRetries: 2,
    });
    const out = result.text.trim();
    // The prompt forbids dropping content, so a length-capped finish or much-shorter
    // result means the tail was lost — a complete un-humanized script beats a cut-off one.
    if (!out || result.finishReason === "length" || out.length < scriptText.length * 0.7) {
      return scriptText;
    }
    // Budget overflow: the writer stage already enforced the duration window, so an
    // inflated rewrite (the historical 2-3× short-form blowup) loses to the draft.
    if (maxChars && out.length > maxChars * 1.15 && out.length > scriptText.length) {
      return scriptText;
    }
    return out;
  } catch {
    return scriptText;
  }
}
