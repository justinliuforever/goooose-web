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
      maxOutputTokens: 8192,
      maxRetries: 2,
    });
    return result.text.trim();
  } catch {
    return scriptText;
  }
}
