// Official YouTube Data API v3 client — used as the primary metadata source.
// TikHub provides audio stream URLs and XHS; YouTube Data API gives clean metadata
// (title, view_count, duration, description, thumbnails) for any public video.
//
// Quota: 10,000 units/day free. videos.list = 1 unit per call.

const BASE = "https://www.googleapis.com/youtube/v3";

function key(): string {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY not set in env");
  return k;
}

// Parse ISO 8601 duration (PT13M18S → 798 seconds).
export function parseIsoDuration(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const mi = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  const total = h * 3600 + mi * 60 + s;
  return total > 0 ? total : null;
}

export type YoutubeVideoMeta = {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  durationSec: number | null;
  viewCount: number | null;
  likeCount: number | null;
  thumbnailUrl: string | null;
};

type ApiVideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    description?: string;
    thumbnails?: Record<string, { url: string; width: number }>;
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string };
};

function pickBiggestThumbnail(
  thumbs: Record<string, { url: string; width: number }> | undefined,
): string | null {
  if (!thumbs) return null;
  const arr = Object.values(thumbs);
  if (arr.length === 0) return null;
  return [...arr].sort((a, b) => b.width - a.width)[0]?.url ?? null;
}

function asPositiveNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function mapItem(item: ApiVideoItem): YoutubeVideoMeta {
  return {
    videoId: item.id,
    title: item.snippet?.title ?? "",
    channelId: item.snippet?.channelId ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    description: item.snippet?.description ?? "",
    durationSec: parseIsoDuration(item.contentDetails?.duration),
    viewCount: asPositiveNumber(item.statistics?.viewCount),
    likeCount: asPositiveNumber(item.statistics?.likeCount),
    thumbnailUrl: pickBiggestThumbnail(item.snippet?.thumbnails),
  };
}

// Single-video fetch (1 quota unit). Returns null on any failure so callers can fall back.
export async function fetchVideoMetadata(videoId: string): Promise<YoutubeVideoMeta | null> {
  try {
    const url = `${BASE}/videos?part=snippet,contentDetails,statistics&id=${encodeURIComponent(videoId)}&key=${key()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: ApiVideoItem[] };
    const item = json.items?.[0];
    if (!item) return null;
    return mapItem(item);
  } catch {
    return null;
  }
}

// Batched fetch (still 1 unit per video, but a single HTTP round-trip for up to 50).
export async function fetchVideoMetadataBatch(
  videoIds: string[],
): Promise<Map<string, YoutubeVideoMeta>> {
  const result = new Map<string, YoutubeVideoMeta>();
  if (videoIds.length === 0) return result;
  // API allows up to 50 ids per call.
  for (let i = 0; i < videoIds.length; i += 50) {
    const slice = videoIds.slice(i, i + 50);
    try {
      const url = `${BASE}/videos?part=snippet,contentDetails,statistics&id=${slice.map(encodeURIComponent).join(",")}&key=${key()}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { items?: ApiVideoItem[] };
      for (const item of json.items ?? []) {
        result.set(item.id, mapItem(item));
      }
    } catch {
      /* skip this batch */
    }
  }
  return result;
}
