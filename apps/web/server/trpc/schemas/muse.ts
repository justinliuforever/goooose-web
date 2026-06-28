import { z } from "zod";

export const startMonitorInput = z.object({
  channelId: z.string().uuid(),
  projectId: z.string().uuid(),
  maxVideosPerCompetitor: z.number().int().min(1).max(50).default(10),
  numIdeasPerVideo: z.number().int().min(1).max(10).default(5),
  language: z.enum(["en", "zh"]).default("zh"),
  // Subset of bound competitors to monitor; omitted = all bound, [] = none (extras-only run).
  competitorAccountIds: z.array(z.string().uuid()).max(50).optional(),
  // Unbound competitors to include just for this run (one-off, not permanent 巡视对象).
  extraCompetitorAccountIds: z.array(z.string().uuid()).max(50).optional(),
  // XHS-only content filter (YouTube competitors are unaffected).
  xhsContentType: z.enum(["all", "video", "image"]).default("all"),
});

export type StartMonitorInput = z.infer<typeof startMonitorInput>;

export const approveIdeaInput = z.object({
  ideaId: z.string().uuid(),
  approved: z.boolean(),
});

export type ApproveIdeaInput = z.infer<typeof approveIdeaInput>;
