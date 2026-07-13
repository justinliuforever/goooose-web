import { z } from "zod";

import {
  isValidXhsProfileUrl,
  isValidYoutubeChannelUrl,
} from "@goooose/integrations/validators";

export const platformSchema = z.enum(["youtube", "xhs"]);

function validateChannelUrl(platform: "youtube" | "xhs", url: string): boolean {
  return platform === "youtube" ? isValidYoutubeChannelUrl(url) : isValidXhsProfileUrl(url);
}

const PLATFORM_URL_HINT: Record<"youtube" | "xhs", string> = {
  youtube:
    "YouTube 频道 URL 必须是 /@handle、/channel/UCxxx、/c/name 或 /user/name 形式",
  xhs: "小红书主页 URL：电脑端 xiaohongshu.com/user/profile/... 或手机端分享的 xhslink.com 链接均可",
};

export const createChannelInput = z
  .object({
    name: z.string().min(1, "Required").max(80),
    platform: platformSchema,
    // Optional for 我的账号 — only needed if you later 复盘 the account in Clerk. The account's
    // positioning lives in its Bible, not a free-text description.
    platformUrl: z.string().optional().default(""),
    description: z.string().max(500).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.platformUrl && !validateChannelUrl(v.platform, v.platformUrl)) {
      ctx.addIssue({ code: "custom", message: PLATFORM_URL_HINT[v.platform], path: ["platformUrl"] });
    }
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
    platformUrl: z.string().optional().default(""),
    description: z.string().max(500).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.platformUrl && !validateChannelUrl(v.platform, v.platformUrl)) {
      ctx.addIssue({ code: "custom", message: PLATFORM_URL_HINT[v.platform], path: ["platformUrl"] });
    }
  });

export type UpdateChannelInput = z.infer<typeof updateChannelInput>;

// Re-exported so forms can validate without pulling in the full shared/clients path.
export { isValidYoutubeChannelUrl, isValidXhsProfileUrl };
