// Thumbnail vision via Claude Sonnet — DeepSeek V4 is text-only.

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { jsonrepair } from "jsonrepair";

let _anthropic: ReturnType<typeof createAnthropic> | null = null;

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set in env");
    _anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

export type ThumbnailAnalysis = {
  description: string;
  whyItWorks: string;
  diagnosis: string | null;
  titleSuggestions: string[];
};

const ZH_INSTRUCTION = `你是 YouTube 封面（缩略图）视觉分析师。请观察这张封面，输出严格的 JSON：

{
  "description": "用 2-3 句中文描述封面实际看到的内容（颜色、元素布局、文字、人物表情、视觉钩子）",
  "why_it_works": "用 2-3 句中文说明这张封面为什么有效（点击诱因、情绪触发、对比手法）",
  "diagnosis": "用 1-2 句中文诊断这张封面的薄弱处或可改进点（例如：文字过多、对比度低、主体不清、信息密度问题等）。如果封面已经非常优秀无明显问题，写 null",
  "title_suggestions": ["3 个备选中文标题，每个不超过 25 字，与封面视觉强匹配，并包含具体数字/对比/反差/情绪点之一"]
}

只返回 JSON，不要 markdown 代码块。所有描述基于你真实看到的画面，不要根据标题猜测。`;

const EN_INSTRUCTION = `You are a YouTube cover (thumbnail) visual analyst. Observe this cover and output strict JSON:

{
  "description": "2-3 sentences describing what's actually visible (colors, layout, text, expressions, visual hooks)",
  "why_it_works": "2-3 sentences explaining why this cover works (click triggers, emotional cues, contrast)",
  "diagnosis": "1-2 sentences diagnosing the weakest aspect of this cover or what could be improved (e.g. too much text, low contrast, unclear subject, info density). If the cover is already excellent with no clear issue, write null.",
  "title_suggestions": ["3 alternative title candidates, each ≤ 70 chars, tightly matching the visual, each leveraging concrete numbers / contrast / surprise / emotion"]
}

Return JSON only, no markdown fences. All descriptions must be based on what you actually see, not inferred from the title.`;

// AI SDK's URL-mode fetcher honors robots.txt; some CDNs (XHS rednotecdn) block
// it. Downloading the bytes locally and passing Uint8Array bypasses that
// fetcher entirely and works for any CDN our own fetch can reach.
async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function parseLenient(raw: string): {
  description?: unknown;
  why_it_works?: unknown;
  diagnosis?: unknown;
  title_suggestions?: unknown;
} | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  const slice = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // Claude occasionally emits unescaped " inside Chinese descriptions
    // (e.g. 白色"Johnson"字样); jsonrepair fixes it without losing content.
    try {
      return JSON.parse(jsonrepair(slice));
    } catch {
      return null;
    }
  }
}

export async function analyzeThumbnail(
  thumbnailUrl: string,
  language: "en" | "zh" = "zh",
  logger?: { warn: (msg: string) => void },
): Promise<ThumbnailAnalysis | null> {
  return analyzeImageStack([thumbnailUrl], language, logger);
}

const ZH_STACK_INSTRUCTION = `你是小红书图文笔记视觉分析师。下面是该笔记的多张图片（按顺序），请综合所有图片，输出严格的 JSON：

{
  "description": "用 3-4 句中文综合描述全部图片：第 1 张作为封面起到什么钩子作用、整组图片的视觉风格（排版/配色/字体/拼贴方式）、画面里的核心元素和文字",
  "why_it_works": "用 3-4 句中文说明为什么这组图片有效：封面如何抓住用户、整套图片如何带动用户滑下去看完、有哪些情绪/认知触发"
}

只返回 JSON，不要 markdown 代码块。所有描述基于你真实看到的画面。`;

const EN_STACK_INSTRUCTION = `You are a Xiaohongshu image-post visual analyst. Below are the post's images in order. Synthesize across all of them and output strict JSON:

{
  "description": "3-4 sentences synthesizing all images: how the first image hooks as a cover, the visual style of the whole set (layout/palette/typography/collage), and the core visible elements and text",
  "why_it_works": "3-4 sentences explaining why this image set works: how the cover grabs the user, how the sequence keeps them swiping, and the emotional/cognitive triggers"
}

Return JSON only, no markdown fences. All descriptions must be based on what you actually see.`;

// XHS image-posts: up to 9 images per call so Claude synthesizes the whole gallery, not just the cover.
export async function analyzeImageStack(
  urls: string[],
  language: "en" | "zh" = "zh",
  logger?: { warn: (msg: string) => void },
): Promise<ThumbnailAnalysis | null> {
  try {
    const clipped = urls.filter(Boolean).slice(0, 9);
    if (clipped.length === 0) return null;
    const bytesArr = await Promise.all(clipped.map(fetchImageBytes));
    const valid = bytesArr.filter((b): b is Uint8Array => b !== null);
    if (valid.length === 0) {
      logger?.warn(`vision: all ${clipped.length} image downloads failed`);
      return null;
    }
    if (valid.length < clipped.length) {
      logger?.warn(
        `vision: ${clipped.length - valid.length}/${clipped.length} images failed download, proceeding with ${valid.length}`,
      );
    }
    const single = valid.length === 1;
    const instruction = single
      ? language === "zh"
        ? ZH_INSTRUCTION
        : EN_INSTRUCTION
      : language === "zh"
        ? ZH_STACK_INSTRUCTION
        : EN_STACK_INSTRUCTION;
    const result = await generateText({
      model: getAnthropic()("claude-sonnet-4-6"),
      // Chinese 1 char ≈ 1.5-2 tokens; 2 fields × 4 sentences × ~80 chars
      // each easily hits 1000-2000 tokens per field. 2.5× headroom prevents
      // mid-JSON truncation that defeats parseLenient.
      maxOutputTokens: single ? 4000 : 8000,
      maxRetries: 2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            ...valid.map((b) => ({ type: "image" as const, image: b })),
          ],
        },
      ],
    });
    const parsed = parseLenient(result.text);
    if (!parsed) {
      logger?.warn(`vision parse failed (${clipped.length} imgs): ${result.text.slice(0, 200)}`);
      return null;
    }
    const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const whyItWorks =
      typeof parsed.why_it_works === "string" ? parsed.why_it_works.trim() : "";
    if (!description && !whyItWorks) {
      logger?.warn(`vision returned empty fields (${clipped.length} imgs)`);
      return null;
    }
    const rawDiagnosis = parsed.diagnosis;
    const diagnosis =
      typeof rawDiagnosis === "string" && rawDiagnosis.trim().length > 0 && rawDiagnosis.trim() !== "null"
        ? rawDiagnosis.trim()
        : null;
    const titleSuggestions = Array.isArray(parsed.title_suggestions)
      ? parsed.title_suggestions
          .filter((t): t is string => typeof t === "string")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
          .slice(0, 5)
      : [];
    return { description, whyItWorks, diagnosis, titleSuggestions };
  } catch (err) {
    logger?.warn(
      `vision threw (${urls.length} imgs): ${(err as Error).message?.slice(0, 200)}`,
    );
    return null;
  }
}
