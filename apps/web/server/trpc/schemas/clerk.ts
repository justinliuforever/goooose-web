import { z } from "zod";

export const startAnalysisInput = z.object({
  channelId: z.string().uuid(),
  limit: z.number().int().min(1).max(50).default(5),
  language: z.enum(["en", "zh"]).default("en"),
});

export type StartAnalysisInput = z.infer<typeof startAnalysisInput>;

export const runStatusInput = z.object({
  runId: z.string().uuid(),
});

export type RunStatusInput = z.infer<typeof runStatusInput>;
