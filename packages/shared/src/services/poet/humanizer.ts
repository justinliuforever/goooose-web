// Chinese script humanizer — rewrites AI-drafted scripts to sound natural.
// English scripts skip this pass (no English variant in archive).

import { generateText } from "ai";

import { llm } from "../../clients/llm";
import { buildChineseHumanizerPrompt } from "../../prompts/poet";

export async function humanizeChinese(scriptText: string): Promise<string> {
  try {
    const result = await generateText({
      model: llm("pro"),
      prompt: buildChineseHumanizerPrompt(scriptText),
      temperature: 0.6,
      maxOutputTokens: 16384,
      maxRetries: 2,
    });
    const out = result.text.trim();
    // Never save a truncated humanize: a complete un-humanized script beats a
    // cut-off one. The prompt forbids dropping content, so a length-capped finish
    // or a much-shorter result means the tail (climax/close) was lost — fall back
    // to the full original script in that case.
    if (!out || result.finishReason === "length" || out.length < scriptText.length * 0.7) {
      return scriptText;
    }
    return out;
  } catch {
    return scriptText;
  }
}
