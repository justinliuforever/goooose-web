/**
 * Thin TikHub client. All endpoints we use in Singularity, with the
 * exact param names that the API requires (some are non-obvious — e.g.
 * `channel_url` not `url`, `search_query` not `keyword`).
 *
 * Rate limit: 1 request/sec per route. Caller is responsible for pacing
 * across the same endpoint; cross-endpoint requests can run in parallel.
 */

const BASE = "https://api.tikhub.io";

function key(): string {
  const k = process.env.TIKHUB_API_KEY;
  if (!k) throw new Error("TIKHUB_API_KEY not set in env");
  return k;
}

async function get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${endpoint}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key()}`, accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TikHub ${endpoint} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { code?: number; data?: T; detail?: unknown };
  if (json.code && json.code !== 200) {
    throw new Error(`TikHub ${endpoint} code ${json.code}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return (json.data ?? json) as T;
}

// ── YouTube ─────────────────────────────────────────────────────────

export type YouTubeChannelMeta = {
  channel_id: string;
  channel_name?: string;
  description?: string;
  subscriber_count?: number;
  thumbnail_url?: string;
};

export async function resolveChannelId(channelUrl: string): Promise<string> {
  const data = await get<{ channel_id: string }>(
    "/api/v1/youtube/web/get_channel_id_v2",
    { channel_url: channelUrl },
  );
  return data.channel_id;
}

export async function getChannelInfo(channelId: string): Promise<YouTubeChannelMeta> {
  return get<YouTubeChannelMeta>("/api/v1/youtube/web/get_channel_info", {
    channel_id: channelId,
  });
}

export type YouTubeVideoRef = {
  video_id: string;
  title: string;
  url?: string;
  views?: number;
  view_count?: number;
  duration_sec?: number;
  thumbnail_url?: string;
  published_at?: string;
};

export async function getChannelVideos(channelId: string): Promise<YouTubeVideoRef[]> {
  const data = await get<{ videos?: YouTubeVideoRef[] }>(
    "/api/v1/youtube/web/get_channel_videos_v3",
    { channel_id: channelId },
  );
  return data.videos ?? [];
}

export type YouTubeVideoInfo = {
  video_id: string;
  title: string;
  url: string;
  views: number;
  duration_sec: number;
  thumbnail_url: string;
  channel_id: string;
  channel_name: string;
  description?: string;
  published_at?: string;
};

export async function getVideoInfo(videoId: string): Promise<YouTubeVideoInfo> {
  const data = await get<Record<string, unknown>>(
    "/api/v1/youtube/web/get_video_info_v3",
    { video_id: videoId },
  );

  // TikHub returns variable shapes across endpoints. Normalize what we need.
  const d = data as {
    video_id?: string;
    title?: string;
    url?: string;
    view_count?: number;
    views?: number;
    duration_sec?: number;
    length_seconds?: number;
    thumbnail_url?: string;
    thumbnails?: Array<{ url?: string }>;
    channel_id?: string;
    channel_name?: string;
    description?: string;
    published_at?: string;
  };

  return {
    video_id: d.video_id ?? videoId,
    title: d.title ?? "",
    url: d.url ?? `https://www.youtube.com/watch?v=${videoId}`,
    views: d.view_count ?? d.views ?? 0,
    duration_sec: d.duration_sec ?? d.length_seconds ?? 0,
    thumbnail_url: d.thumbnail_url ?? d.thumbnails?.[d.thumbnails.length - 1]?.url ?? "",
    channel_id: d.channel_id ?? "",
    channel_name: d.channel_name ?? "",
    description: d.description,
    published_at: d.published_at,
  };
}

export type CaptionTrack = {
  language_code: string;
  language_name: string;
  base_url: string;
  is_translatable?: boolean;
  kind?: string;
};

export async function getCaptionsManifest(videoId: string): Promise<CaptionTrack[]> {
  const data = await get<{ captions?: CaptionTrack[] }>(
    "/api/v1/youtube/web_v2/get_video_captions_v2",
    { video_id: videoId },
  );
  return data.captions ?? [];
}

/**
 * Fetch the actual transcript text by hitting YouTube's signed timedtext URL
 * (returned in the captions manifest). YouTube charges nothing; TikHub
 * charges nothing. The XML uses `<p t="ms" d="ms">text</p>` per caption line.
 */
export async function fetchTranscriptText(baseUrl: string): Promise<string> {
  const res = await fetch(baseUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`YouTube timedtext HTTP ${res.status}`);
  const xml = await res.text();
  // Strip XML tags, decode HTML entities, normalize whitespace.
  const lines = xml.match(/<p[^>]*>([^<]*)<\/p>/g) ?? [];
  const text = lines
    .map((line) => line.replace(/<[^>]*>/g, ""))
    .join("\n")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
  return text.trim();
}

/**
 * Convenience: best-effort transcript text for a video. Returns null if no
 * captions in any language (caller should fall through to ASR).
 */
export async function getTranscript(
  videoId: string,
  preferLangs: string[] = ["en", "zh", "zh-CN", "zh-TW"],
): Promise<{ text: string; languageCode: string } | null> {
  const tracks = await getCaptionsManifest(videoId);
  if (tracks.length === 0) return null;
  const sorted = [...tracks].sort((a, b) => {
    const ai = preferLangs.indexOf(a.language_code);
    const bi = preferLangs.indexOf(b.language_code);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  const track = sorted[0]!;
  const text = await fetchTranscriptText(track.base_url);
  return { text, languageCode: track.language_code };
}

export type AudioStream = {
  itag: number;
  mime_type: string;
  url: string;
  audio_quality?: string;
  content_length?: string;
};

export async function getAudioStreams(videoId: string): Promise<AudioStream[]> {
  const data = await get<{
    adaptive_formats?: AudioStream[];
    streams?: AudioStream[];
  }>("/api/v1/youtube/web_v2/get_video_streams_v2", { video_id: videoId });
  const all = [...(data.adaptive_formats ?? []), ...(data.streams ?? [])];
  return all.filter((s) => s.mime_type?.startsWith("audio/"));
}

// ── Xiaohongshu ─────────────────────────────────────────────────────

export type XhsNoteRef = {
  id: string;
  note_id?: string;
  title?: string;
  type?: "video" | "image" | string;
  user_id?: string;
};

export async function searchXhsNotes(keyword: string): Promise<XhsNoteRef[]> {
  const data = await get<{ items?: XhsNoteRef[] }>(
    "/api/v1/xiaohongshu/app_v2/search_notes",
    { keyword },
  );
  return data.items ?? [];
}
