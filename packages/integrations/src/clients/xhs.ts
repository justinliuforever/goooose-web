// TikHub XHS client. All routes use the app_v2 series — the legacy /xiaohongshu/web/*
// and /app/* prefixes are deprecated (scheduled for removal per the 2026-06 TikHub notice).

import { recordUsage } from "../metering";

const BASE = "https://api.tikhub.io";

const XHS_USER_ID_RE = /^[a-f0-9]{24}$/i;
const XHS_NOTE_ID_RE = /^[a-f0-9]{16,32}$/i;

function key(): string {
  const k = process.env.TIKHUB_API_KEY;
  if (!k) throw new Error("TIKHUB_API_KEY not set in env");
  return k;
}

// TikHub 5xx (Cloudflare 504 on overloaded origin) and 400 ("Please retry")
// are commonly transient — retry up to 3x with 800ms backoff per RedFinch.
async function get<T>(
  endpoint: string,
  params: Record<string, string>,
  attempts = 3,
): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE}${endpoint}?${qs}`;
  let lastErr: Error | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${key()}`,
          accept: "application/json",
          "User-Agent": "Mozilla/5.0",
        },
      });
      if (res.status >= 500 || res.status === 429 || res.status === 400) {
        const body = await res.text();
        lastErr = new Error(`TikHub ${endpoint} HTTP ${res.status}: ${body.slice(0, 120)}`);
        if (i < attempts) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = res.status === 429 && retryAfter > 0 ? retryAfter * 1000 : 800 * i;
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`TikHub ${endpoint} HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      recordUsage({ resourceType: "scrape", provider: "tikhub", model: endpoint, apiCalls: 1 });
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err as Error;
      if (i >= attempts) throw lastErr;
      await new Promise((r) => setTimeout(r, 800 * i));
    }
  }
  throw lastErr ?? new Error(`TikHub ${endpoint} unreachable`);
}

export function extractXhsUserId(input: string): string | null {
  const s = input.trim();
  if (XHS_USER_ID_RE.test(s)) return s;
  try {
    const parsed = new URL(s);
    const m = parsed.pathname.match(/\/user\/profile\/([a-f0-9]{24})/i);
    if (m) return m[1]!;
  } catch {
    /* fall through */
  }
  return null;
}

export function extractXhsNoteId(input: string): string | null {
  const s = input.trim();
  if (XHS_NOTE_ID_RE.test(s)) return s;
  // Share-card pastes wrap the URL in title/emoji text ("60 【…】 😆 token 😆 https://…/explore/<id>"),
  // so new URL(s) throws on the whole string. Scan for an embedded note URL anywhere first.
  const embedded = s.match(/(?:explore|discovery\/item)\/([a-f0-9]{16,32})/i);
  if (embedded) return embedded[1]!;
  try {
    const parsed = new URL(s);
    const m = parsed.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{16,32})/i);
    if (m) return m[1]!;
  } catch {
    /* fall through */
  }
  return null;
}

export { findXhsShortLink, isValidXhsProfileUrl } from "../validators";

import { findXhsShortLink } from "../validators";

// Follow the xhslink.com short-link redirect server-side. The timeout stops a stalled
// xhslink from hanging the run; any failure passes the input through unchanged.
export async function expandXhsShortLink(input: string): Promise<string> {
  const short = findXhsShortLink(input);
  if (!short) return input;
  try {
    const res = await fetch(short, {
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" },
    });
    void res.body?.cancel(); // only res.url is needed — release the socket
    return res.url || input;
  } catch {
    return input;
  }
}

export function isValidXhsNoteUrl(input: string): boolean {
  return extractXhsNoteId(input) !== null;
}

// Regex-scan, not new URL(): share cards wrap the URL in text, so parsing the whole
// string throws and drops the token.
export function extractXsecToken(input: string): string | null {
  const m = input.match(/[?&]xsec_token=([^&\s"'<>#]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]!);
  } catch {
    return m[1]!;
  }
}

export type XhsUser = {
  userId: string;
  nickname: string;
  redId: string;
  desc: string;
  avatarUrl: string;
  fansCount: number;
  interactionsCount: number;
  ipLocation: string;
};

export type XhsImage = {
  url: string;
  originalUrl: string;
  width: number;
  height: number;
};

export type XhsVideoStream = {
  masterUrl: string;
  size: number;
  width: number;
  height: number;
  codec: "h264" | "h265";
};

export type XhsNote = {
  noteId: string;
  type: "video" | "image";
  title: string;
  desc: string;
  createTime: number;
  likes: number;
  collectedCount: number;
  commentsCount: number;
  shareCount: number;
  niceCount: number;
  engagementScore: number;
  videoStreams: XhsVideoStream[];
  durationSec: number | null;
  thumbnailUrl: string | null;
  images: XhsImage[];
  channelName: string;
  channelId: string;
  noteUrl: string;
};

type RawUserInfo = {
  data?: {
    data?: {
      userid?: string;
      red_id?: string;
      desc?: string;
      imageb?: string;
      ip_location?: string;
      share_info_v2?: { title?: string };
      interactions?: Array<{ type?: string; count?: number }>;
    };
  };
};

type RawStream = {
  master_url?: string;
  size?: number;
  width?: number;
  height?: number;
  video_codec?: string;
};

type RawImage = {
  url?: string;
  original?: string;
  url_size_large?: string;
  width?: number;
  height?: number;
};

type RawNote = {
  cursor?: string;
  id?: string;
  title?: string;
  display_title?: string;
  desc?: string;
  type?: string;
  create_time?: number;
  time?: number;
likes?: number;
  share_count?: number;
liked_count?: number;
  shared_count?: number;
collected_count?: number;
  comments_count?: number;
  nice_count?: number;
  user?: { nickname?: string; userid?: string };
  video_info_v2?: {
    capa?: { duration?: number };
    image?: { first_frame?: string };
    media?: { stream?: { h264?: RawStream[]; h265?: RawStream[] } };
  };
  images_list?: RawImage[];
  // Detail endpoints only; carries the tokenized share URL (list notes omit it).
  share_info?: { link?: string };
};

type RawNoteListResp = { data?: { data?: { notes?: RawNote[] } } };
// app_v2/get_image_note_detail wraps the note as {user, note_list} (same as legacy v4).
type RawNoteDetailResp = {
  data?: {
    data?: Array<{
      user?: { userid?: string; nickname?: string };
      note_list?: RawNote[];
    }>;
  };
};
// app_v2/get_video_note_detail returns the note itself at data.data[0] (carries video_info_v2).
type RawVideoDetailResp = { data?: { data?: RawNote[] } };

// XHS share_info_v2.title comes wrapped as "@昵称的个人主页" (zh) or "@昵称's profile" (en
// locale); strip both wrappers so the stored name isn't "昵称's profile".
function cleanNickname(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/^@/, "")
    .replace(/的个人主页$/, "")
    // XHS emits U+2018 LEFT single quote (’s profile came back as ‘s profile in live data).
    .replace(/['’‘]s profile$/i, "")
    .trim();
}

// XHS API sometimes returns literal "无标题" even when creator set a title;
// fall back to first non-empty line of desc.
function effectiveTitle(rawTitle: string, displayTitle: string, desc: string): string {
  for (const candidate of [rawTitle, displayTitle]) {
    const t = (candidate ?? "").trim();
    if (t && t !== "无标题") return t;
  }
  const firstLine = (desc ?? "").split("\n").map((s) => s.trim()).find((s) => s.length > 0);
  return firstLine ?? "(untitled)";
}

export function computeXhsEngagement(n: {
  likes: number;
  collectedCount: number;
  commentsCount: number;
  shareCount: number;
}): number {
  return n.likes + n.collectedCount * 2 + n.commentsCount * 3 + n.shareCount * 5;
}

// XHS CDN serves images as HEIF by default (see imageView2/.../format/heif).
// Claude vision only accepts JPEG/PNG/GIF/WebP AND requires https — rewrite
// both. The image-object signature isn't tied to the imageView2 params so the
// JPG swap stays valid.
export function normalizeXhsImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/\bformat\/heif\b/gi, "format/jpg");
}

// Web XHS locks note pages behind xsec_token — a bare explore/<id> URL shows
// "Page Isn't Available". Keep the token in the stored URL whenever we have one.
export function buildXhsNoteUrl(noteId: string, xsecToken?: string | null): string {
  if (!xsecToken) return `https://www.xiaohongshu.com/explore/${noteId}`;
  const qs = new URLSearchParams({ xsec_token: xsecToken, xsec_source: "app_share" });
  return `https://www.xiaohongshu.com/explore/${noteId}?${qs}`;
}

function normalizeNote(
  raw: RawNote,
  parentUser?: { nickname?: string; userid?: string },
  xsecTokenHint?: string | null,
): XhsNote {
  const noteId = raw.cursor ?? raw.id ?? "";
  const type: XhsNote["type"] = raw.type === "video" ? "video" : "image";
  const title = effectiveTitle(raw.title ?? "", raw.display_title ?? "", raw.desc ?? "");

  // v2 uses `likes` / `share_count`, v4 uses `liked_count` / `shared_count`.
  const likes = Number(raw.likes ?? raw.liked_count ?? 0);
  const shareCount = Number(raw.share_count ?? raw.shared_count ?? 0);
  const collectedCount = Number(raw.collected_count ?? 0);
  const commentsCount = Number(raw.comments_count ?? 0);

  const engagementScore = computeXhsEngagement({ likes, collectedCount, commentsCount, shareCount });

  const streams = [
    ...(raw.video_info_v2?.media?.stream?.h264 ?? []),
    ...(raw.video_info_v2?.media?.stream?.h265 ?? []),
  ]
    .filter((s) => s.master_url)
    .map<XhsVideoStream>((s) => ({
      masterUrl: String(s.master_url),
      size: Number(s.size ?? 0),
      width: Number(s.width ?? 0),
      height: Number(s.height ?? 0),
      codec: s.video_codec === "hevc" ? "h265" : "h264",
    }))
    .sort((a, b) => a.size - b.size);

  const durationSec =
    typeof raw.video_info_v2?.capa?.duration === "number"
      ? raw.video_info_v2.capa.duration
      : null;

  const rawThumb =
    raw.video_info_v2?.image?.first_frame ?? raw.images_list?.[0]?.url ?? null;
  const thumbnailUrl = rawThumb ? normalizeXhsImageUrl(rawThumb) : null;

  const images: XhsImage[] = (raw.images_list ?? [])
    .filter((i) => i.url)
    .map<XhsImage>((i) => ({
      url: normalizeXhsImageUrl(String(i.url)),
      originalUrl: normalizeXhsImageUrl(
        String(i.original || i.url_size_large || i.url || ""),
      ),
      width: Number(i.width ?? 0),
      height: Number(i.height ?? 0),
    }));

  const user = raw.user ?? parentUser ?? {};
  const xsecToken =
    (raw.share_info?.link ? extractXsecToken(raw.share_info.link) : null) ?? xsecTokenHint ?? null;

  return {
    noteId,
    type,
    title,
    desc: raw.desc ?? "",
    createTime: Number(raw.create_time ?? raw.time ?? 0),
    likes,
    collectedCount,
    commentsCount,
    shareCount,
    niceCount: Number(raw.nice_count ?? 0),
    engagementScore,
    videoStreams: streams,
    durationSec,
    thumbnailUrl: thumbnailUrl ?? null,
    images,
    channelName: user.nickname ?? "",
    channelId: user.userid ?? "",
    noteUrl: buildXhsNoteUrl(noteId, xsecToken),
  };
}

export async function resolveXhsUser(profileUrlOrId: string): Promise<XhsUser> {
  const expanded = await expandXhsShortLink(profileUrlOrId);
  const userId = extractXhsUserId(expanded);
  if (!userId) {
    throw new Error(`Could not extract XHS user_id from: ${expanded}`);
  }
  // app_v2 replaces deprecated `web/get_user_info`. Response shape backward-compatible.
  const j = await get<RawUserInfo>("/api/v1/xiaohongshu/app_v2/get_user_info", { user_id: userId });
  const d = j.data?.data ?? {};
  const interactions = d.interactions ?? [];
  const fansCount = Number(interactions.find((i) => i.type === "fans")?.count ?? 0);
  const interactionsCount = Number(
    interactions.find((i) => i.type === "interaction")?.count ?? 0,
  );
  return {
    userId,
    nickname: cleanNickname(d.share_info_v2?.title),
    redId: d.red_id ?? "",
    desc: d.desc ?? "",
    avatarUrl: d.imageb ?? "",
    fansCount,
    interactionsCount,
    ipLocation: d.ip_location ?? "",
  };
}

// Returns up to `limit` notes from the user's recent feed, ordered as XHS returns
// them (typically newest first; XHS doesn't expose explicit sort options).
export async function getXhsUserNotes(
  profileUrlOrId: string,
  limit = 5,
): Promise<XhsNote[]> {
  const expanded = await expandXhsShortLink(profileUrlOrId);
  const userId = extractXhsUserId(expanded);
  if (!userId) throw new Error(`Could not extract user_id from: ${expanded}`);
  // app_v2 replaces deprecated `web/get_user_notes_v2`. Response keeps `data.data.notes`.
  const j = await get<RawNoteListResp>("/api/v1/xiaohongshu/app_v2/get_user_posted_notes", {
    user_id: userId,
    num: String(Math.max(limit, 10)),
  });
  const raws = j.data?.data?.notes ?? [];
  return raws.slice(0, limit).map((n) => normalizeNote(n));
}

// Single-note fetch (note URL is the only handle, e.g. Custom Topic references or XHS
// "urls" analysis). get_image_note_detail returns the requested note for BOTH image and
// video ids ({user, note_list} — the legacy v4 shape), so it's the reliable identity/text
// source; but it omits video streams. For video notes we supplement from
// get_video_note_detail, whose data.data[0] is the note with video_info_v2 — reliable only
// for video ids (it returns recommended notes for non-video ids), so we guard on id match.
export async function getXhsNoteDetail(
  noteId: string,
  xsecTokenHint?: string | null,
): Promise<XhsNote | null> {
  const j = await get<RawNoteDetailResp>("/api/v1/xiaohongshu/app_v2/get_image_note_detail", {
    note_id: noteId,
  });
  const first = j.data?.data?.[0];
  if (!first) return null;
  const noteRaw = first.note_list?.[0];
  if (!noteRaw) return null;

  if (noteRaw.type === "video") {
    try {
      const vj = await get<RawVideoDetailResp>(
        "/api/v1/xiaohongshu/app_v2/get_video_note_detail",
        { note_id: noteId },
      );
      const vEl = vj.data?.data?.[0];
      if (vEl && (vEl.id === noteId || vEl.cursor === noteId) && vEl.video_info_v2) {
        noteRaw.video_info_v2 = vEl.video_info_v2;
      }
    } catch {
      // streams unavailable — keep text/metadata/cover from the image endpoint
    }
  }

  return normalizeNote(noteRaw, first.user, xsecTokenHint);
}

// Token-only fetch for list-sourced notes (list responses carry no share_info):
// one image-detail call regardless of note type — enough to read share_info.link.
export async function getXhsNoteXsecToken(noteId: string): Promise<string | null> {
  const j = await get<RawNoteDetailResp>("/api/v1/xiaohongshu/app_v2/get_image_note_detail", {
    note_id: noteId,
  });
  const link = j.data?.data?.[0]?.note_list?.[0]?.share_info?.link;
  return link ? extractXsecToken(link) : null;
}
