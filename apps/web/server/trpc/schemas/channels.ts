import { z } from "zod";

import { isValidYoutubeChannelUrl } from "@singularity/shared/clients/tikhub";
import { isValidXhsProfileUrl } from "@singularity/shared/clients/xhs";

export const platformSchema = z.enum(["youtube", "xhs"]);

function validateChannelUrl(platform: "youtube" | "xhs", url: string): boolean {
  return platform === "youtube" ? isValidYoutubeChannelUrl(url) : isValidXhsProfileUrl(url);
}

const PLATFORM_URL_HINT: Record<"youtube" | "xhs", string> = {
  youtube:
    "YouTube 频道 URL 必须是 /@handle、/channel/UCxxx、/c/name 或 /user/name 形式",
  xhs: "小红书主页 URL 必须是 https://www.xiaohongshu.com/user/profile/{24位hex}",
};

export const createChannelInput = z
  .object({
    name: z.string().min(1, "Required").max(80),
    platform: platformSchema,
    platformUrl: z.string().url("Must be a valid URL"),
    description: z.string().max(500).optional().nullable(),
  })
  .refine((v) => validateChannelUrl(v.platform, v.platformUrl), {
    message: PLATFORM_URL_HINT.youtube,
    path: ["platformUrl"],
  });

export type CreateChannelInput = z.infer<typeof createChannelInput>;

export const deleteChannelInput = z.object({
  id: z.string().uuid(),
});

export const regenerateSlugInput = z.object({
  id: z.string().uuid(),
});

export type DeleteChannelInput = z.infer<typeof deleteChannelInput>;

export const updateChannelInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1, "Required").max(80),
    platform: platformSchema,
    platformUrl: z.string().url("Must be a valid URL"),
    description: z.string().max(500).nullable().optional(),
  })
  .refine((v) => validateChannelUrl(v.platform, v.platformUrl), {
    message: PLATFORM_URL_HINT.youtube,
    path: ["platformUrl"],
  });

export type UpdateChannelInput = z.infer<typeof updateChannelInput>;

// Client-side helpers (also exported from the URL utility but re-exported here
// so the forms can validate without pulling in the full shared/clients path).
export { isValidYoutubeChannelUrl, isValidXhsProfileUrl };
