import {
  isValidDouyinProfileUrl,
  isValidXhsProfileUrl,
  isValidYoutubeChannelUrl,
} from "@goooose/integrations/validators";

export const PLATFORM_LABEL = { youtube: "YouTube", xhs: "小红书", douyin: "抖音" } as const;
export type Platform = keyof typeof PLATFORM_LABEL;

// YouTube ranks by views; XHS/Douyin expose an interaction score, not a raw play count.
export const PLATFORM_METRIC_LABEL = { youtube: "播放量", xhs: "互动分", douyin: "互动分" } as const;

export const PLATFORM_CONTENT_UNIT = {
  youtube: { measure: "个", noun: "视频" },
  xhs: { measure: "篇", noun: "笔记" },
  douyin: { measure: "条", noun: "作品" },
} as const;

export function inferPlatform(url: string): Platform {
  if (/douyin\.com|iesdouyin\.com/.test(url)) return "douyin";
  if (/xiaohongshu|xhslink/.test(url)) return "xhs";
  return "youtube";
}

export function isValidPlatformUrl(platform: Platform, url: string): boolean {
  if (platform === "xhs") return isValidXhsProfileUrl(url);
  if (platform === "douyin") return isValidDouyinProfileUrl(url);
  return isValidYoutubeChannelUrl(url);
}
