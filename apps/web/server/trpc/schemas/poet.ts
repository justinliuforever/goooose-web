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
});

export const generateScriptInput = z.object({
  channelId: z.string().uuid(),
  ideaId: z.string().uuid(),
  durationMinutes: z.number().int().min(1).max(60).default(5),
  language: z.enum(["en", "zh"]).default("zh"),
});
