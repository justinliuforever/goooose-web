import { z } from "zod";

export const startAnalysisInput = z
  .object({
    channelId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).default(10),
    language: z.enum(["en", "zh"]).default("zh"),
    mode: z.enum(["overwrite", "incremental"]).default("overwrite"),
    source: z.enum(["newest", "popular", "urls"]).default("newest"),
    videoIds: z.array(z.string().min(1)).max(50).default([]),
    recencyMonths: z.union([z.literal(1), z.literal(3), z.literal(6), z.null()]).default(null),
  })
  .refine((v) => v.source !== "urls" || v.videoIds.length > 0, {
    message: "指定链接模式下至少需要 1 个视频 URL",
    path: ["videoIds"],
  });

export type StartAnalysisInput = z.infer<typeof startAnalysisInput>;

export const runStatusInput = z.object({
  runId: z.string().uuid(),
});

export type RunStatusInput = z.infer<typeof runStatusInput>;

export const deleteSopInput = z.object({
  sopId: z.string().uuid(),
});

export const detectSeriesInput = z.object({
  channelId: z.string().uuid(),
  videoCount: z.number().int().min(20).max(200).default(100),
  language: z.enum(["en", "zh"]).default("zh"),
});

export const listSeriesInput = z.object({
  channelId: z.string().uuid(),
});
