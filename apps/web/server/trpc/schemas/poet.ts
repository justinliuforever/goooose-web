import { z } from "zod";

export const generateBibleInput = z.object({
  channelId: z.string().uuid(),
  ideaText: z.string().min(20).max(4000),
  name: z.string().max(120).optional(),
  language: z.enum(["en", "zh"]).default("zh"),
});

export const updateBibleInput = z.object({
  bibleId: z.string().uuid(),
  name: z.string().max(120).optional(),
  content: z.string().min(20).optional(),
});

export const switchActiveBibleInput = z.object({
  bibleId: z.string().uuid(),
  // Account-level pages omit projectId; only a project context sets the per-project pin.
  projectId: z.string().uuid().optional(),
});

// Duration in seconds (supports ≤60s short videos). ≥ 2000 zh chars / ≥ 1500 en
// words (≈10 min) routes to long-form.
export const generateScriptInput = z.object({
  channelId: z.string().uuid(),
  projectId: z.string().uuid(),
  ideaId: z.string().uuid(),
  durationSeconds: z.number().int().min(15).max(3600).default(300),
  language: z.enum(["en", "zh"]).default("zh"),
});

export const customTopicReferenceInput = z.object({
  kind: z.enum(["youtube", "xhs", "text"]),
  url: z.string().url().optional(),
  text: z.string().max(20000).optional(),
  title: z.string().max(200).optional(),
});

export const createCustomTopicInput = z.object({
  channelId: z.string().uuid(),
  projectId: z.string().uuid(),
  topic: z.string().min(5).max(2000),
  references: z.array(customTopicReferenceInput).max(10).default([]),
  language: z.enum(["en", "zh"]).default("zh"),
  sourceIdeaId: z.string().uuid().optional(),
});

export const updateCustomTopicInput = z.object({
  topicId: z.string().uuid(),
  topic: z.string().min(5).max(2000).optional(),
  references: z.array(customTopicReferenceInput).max(10).optional(),
  language: z.enum(["en", "zh"]).optional(),
});

export const deleteCustomTopicInput = z.object({
  topicId: z.string().uuid(),
});

export const deleteBibleInput = z.object({
  bibleId: z.string().uuid(),
});

export const deleteScriptInput = z.object({
  scriptId: z.string().uuid(),
});

export const analyzeCustomTopicInput = z.object({
  channelId: z.string().uuid(),
  projectId: z.string().uuid(),
  topicId: z.string().uuid(),
  language: z.enum(["en", "zh"]).default("zh"),
});

export const generateScriptFromCustomTopicInput = z.object({
  channelId: z.string().uuid(),
  projectId: z.string().uuid(),
  topicId: z.string().uuid(),
  durationSeconds: z.number().int().min(15).max(3600).default(300),
  language: z.enum(["en", "zh"]).default("zh"),
});
