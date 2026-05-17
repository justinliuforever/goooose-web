import { z } from "zod";

export const platformSchema = z.enum(["youtube", "xhs"]);

export const competitorRefSchema = z.object({
  platform: platformSchema,
  url: z.string().url(),
});

export type CompetitorRefInput = z.infer<typeof competitorRefSchema>;

export const createChannelInput = z.object({
  name: z.string().min(1, "Required").max(80),
  platform: platformSchema,
  platformUrl: z.string().url("Must be a valid URL"),
  description: z.string().max(500).optional().nullable(),
});

export type CreateChannelInput = z.infer<typeof createChannelInput>;

export const deleteChannelInput = z.object({
  id: z.string().uuid(),
});

export type DeleteChannelInput = z.infer<typeof deleteChannelInput>;

export const updateChannelInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Required").max(80),
  platform: platformSchema,
  platformUrl: z.string().url("Must be a valid URL"),
  description: z.string().max(500).nullable().optional(),
  competitors: z.array(competitorRefSchema).max(20).optional(),
});

export type UpdateChannelInput = z.infer<typeof updateChannelInput>;
