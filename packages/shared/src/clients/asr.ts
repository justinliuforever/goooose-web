import { createWriteStream, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { classifyError, ProxyPool, type ProxySession } from "../proxy";
import {
  downloadAudioWithYtdlp,
  ensureYtdlpBinary,
  getAutoCaptionsYtdlp,
} from "./ytdlp";

// Keep this list short — every language is a separate YouTube subtitle endpoint
// request and they rate-limit aggressively (429) past ~3 langs per video.
const CAPTION_PREFER_LANGS = ["en", "zh-Hans"];

// Minimum char count from auto-captions before we trust them — anything below
// is treated as "no captions, fall through to audio ASR".
const CAPTION_MIN_CHARS = 80;

// Cap audio ASR fallback: above this duration the audio file gets unwieldy and
// Deepgram billing becomes unhappy.
const MAX_AUDIO_DURATION_SEC = 3600;

const QWEN_FILE_LIMIT_BYTES = 10 * 1024 * 1024; // Qwen3-ASR OpenAI-compatible mode cap
const DOWNLOAD_TIMEOUT_MS = 900_000;

function extensionForMime(mime?: string): string {
  if (!mime) return "m4a";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "m4a";
}

async function downloadOnce(url: string, ext: string): Promise<string> {
  const dest = join(
    tmpdir(),
    `singularity-asr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`audio download HTTP ${res.status}`);
    // pipeline() vs pipe()+finished() so AbortError can't escape as unhandled 'error'
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
    return dest;
  } catch (err) {
    try {
      unlinkSync(dest);
    } catch {
      /* partial file may not exist */
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadToTemp(
  url: string,
  ext: string,
  attempts = 2,
  logger?: { warn: (msg: string) => void },
): Promise<string> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await downloadOnce(url, ext);
    } catch (err) {
      lastErr = err as Error;
      if (attempt < attempts) {
        logger?.warn(
          `Download attempt ${attempt}/${attempts} failed (${lastErr.message?.slice(0, 80)}), retrying in ${attempt}s`,
        );
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  }
  throw lastErr ?? new Error("download failed after retries");
}

type DgWord = { word?: string; start?: number; end?: number };
type DgResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; words?: DgWord[] }>;
      detected_language?: string;
    }>;
  };
  err_code?: string;
  err_msg?: string;
};

async function transcribeWithDeepgram(
  bytes: Uint8Array,
  mime: string,
): Promise<{
  text: string;
  durationSec?: number;
  detectedLanguage?: string;
  words: Array<{ w: string; t: number }>;
} | null> {
  if (!process.env.DEEPGRAM_API_KEY) return null;
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&punctuate=true&utterances=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": mime,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Deepgram HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const dg = (await res.json()) as DgResponse;
  if (dg.err_code) throw new Error(`Deepgram ${dg.err_code}: ${dg.err_msg}`);
  const alt = dg.results?.channels?.[0]?.alternatives?.[0];
  const transcript = alt?.transcript?.trim() ?? "";
  if (!transcript) return null;
  const words = (alt?.words ?? [])
    .filter((w) => w.word && typeof w.start === "number")
    .map((w) => ({ w: (w.word ?? "").trim(), t: Math.floor(w.start ?? 0) }));
  return {
    text: transcript,
    durationSec: dg.metadata?.duration,
    detectedLanguage: dg.results?.channels?.[0]?.detected_language,
    words,
  };
}

export type AsrResult = {
  text: string;
  detectedLanguage?: string;
  durationSec?: number;
  provider: "deepgram" | "youtube_auto" | "qwen";
  words: Array<{ w: string; t: number }>;
};

// Filter out words falling inside ad / promo windows so the LLM doesn't score
// sponsor read-outs as actual content hooks/CTAs.
const AD_CATEGORIES = new Set(["sponsor", "selfpromo"]);

export function stripAdSegments(
  words: Array<{ w: string; t: number }>,
  sponsorChapters: Array<{ start_time: number; end_time: number; category: string }>,
): Array<{ w: string; t: number }> {
  const ads = sponsorChapters.filter((c) => AD_CATEGORIES.has(c.category));
  if (ads.length === 0) return words;
  return words.filter(
    (w) => !ads.some((a) => w.t >= a.start_time && w.t < a.end_time),
  );
}

// Inject [mm:ss] markers every ~6 seconds so the LLM can cite specific moments
// without ballooning prompt length (token-balanced for 5-15 chars/sec speech).
const TIMESTAMP_INTERVAL_SEC = 6;

export function renderTranscriptWithTimestamps(
  text: string,
  words: Array<{ w: string; t: number }>,
): string {
  if (words.length === 0) return text;
  const segments: string[] = [];
  let lastStamp = -TIMESTAMP_INTERVAL_SEC;
  let buffer: string[] = [];
  const flush = (t: number) => {
    if (buffer.length === 0) return;
    const mm = Math.floor(t / 60);
    const ss = t % 60;
    segments.push(`[${mm}:${ss.toString().padStart(2, "0")}] ${buffer.join(" ")}`);
    buffer = [];
  };
  for (const word of words) {
    if (word.t - lastStamp >= TIMESTAMP_INTERVAL_SEC) {
      flush(lastStamp >= 0 ? lastStamp : 0);
      lastStamp = word.t;
    }
    buffer.push(word.w);
  }
  flush(lastStamp >= 0 ? lastStamp : 0);
  return segments.join("\n");
}

export type AsrPhase = "selecting" | "downloading" | "transcribing";

// Below this chars/sec rate Deepgram is almost certainly garbled (observed on
// CN+EN code-switching audio). Real speech is 5-15 chars/sec for both langs.
const MIN_CHARS_PER_SEC = 1;

export type StreamCandidate = {
  url: string;
  mimeType?: string;
  sizeHint?: number;
  label?: string;
};

export type TranscribeOpts = {
  onPhase?: (phase: AsrPhase, info?: { bytes?: number; provider?: string }) => void;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
  durationSec?: number;
  tag?: string;
};

// Qwen3-ASR-Flash (Alibaba Model Studio, Singapore) — Chinese-native ASR. Handles
// XHS h265 video/mp4 directly, far better Mandarin than Deepgram, ~1-5s. OpenAI-
// compatible chat endpoint, base64 data-URI input (10MB cap). Pass language to
// force it (XHS -> "zh"); omit for auto-detect (enable_lid).
async function transcribeWithQwen(
  tempPath: string,
  mime: string,
  language?: string,
): Promise<{ text: string; detectedLanguage?: string; words: Array<{ w: string; t: number }> } | null> {
  const key = process.env.DASHSCOPE_API_KEY;
  const base = process.env.DASHSCOPE_ASR_BASE_URL;
  if (!key || !base) return null; // not configured
  const b64 = readFileSync(tempPath).toString("base64");
  const mediaType = /^(audio|video)\//.test(mime) ? mime : "audio/mp4";
  const asrOptions: Record<string, unknown> = { enable_lid: true, enable_itn: false };
  if (language) asrOptions.language = language;
  const res = await fetch(`${base}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3-asr-flash",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${mediaType};base64,${b64}` } }] }],
      stream: false,
      asr_options: asrOptions,
    }),
  });
  if (!res.ok) {
    throw new Error(`Qwen ASR HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
  }
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = (j.choices?.[0]?.message?.content ?? "").trim();
  if (!text) return null;
  return { text, words: [], detectedLanguage: language ?? "auto" };
}

async function transcribeAtPath(
  tempPath: string,
  mime: string,
  sizeBytes: number,
  opts: TranscribeOpts,
  preferQwen = false,
): Promise<AsrResult | null> {
  const { onPhase, logger, durationSec, tag = "ASR" } = opts;
  const qwenFits = sizeBytes <= QWEN_FILE_LIMIT_BYTES;

  if (preferQwen) {
    // XHS / Chinese: Qwen3-ASR-Flash only (force zh). Deepgram returns gibberish on
    // Chinese, so there's no audio fallback — on failure return null and let the
    // caller fall back to title-only text.
    if (!qwenFits) {
      logger?.warn(`${tag}: file ${sizeBytes}B exceeds Qwen 10MB cap, skipping ASR`);
      return null;
    }
    onPhase?.("transcribing", { bytes: sizeBytes, provider: "qwen" });
    try {
      const qwen = await transcribeWithQwen(tempPath, mime, "zh");
      if (qwen) {
        logger?.info(`${tag}: Qwen OK (${qwen.text.length} chars)`);
        return { ...qwen, provider: "qwen" };
      }
      logger?.warn(`${tag}: Qwen returned empty`);
    } catch (err) {
      logger?.warn(`${tag}: Qwen failed (${(err as Error).message?.slice(0, 160)})`);
    }
    return null;
  }

  // YouTube / English: Deepgram primary (fast, handles long audio); Qwen as a
  // ≤10MB fallback (auto language).
  onPhase?.("transcribing", { bytes: sizeBytes, provider: "deepgram" });
  try {
    const bytes = readFileSync(tempPath);
    const dg = await transcribeWithDeepgram(bytes, mime);
    if (dg) {
      const effectiveDur = durationSec ?? dg.durationSec;
      const ratio = effectiveDur && effectiveDur > 0 ? dg.text.length / effectiveDur : Infinity;
      if (effectiveDur && effectiveDur > 30 && ratio < MIN_CHARS_PER_SEC) {
        logger?.warn(
          `${tag}: Deepgram returned ${dg.text.length} chars for ${effectiveDur}s audio (${ratio.toFixed(2)} chars/sec, likely garbled), trying Qwen`,
        );
      } else {
        logger?.info(`${tag}: Deepgram OK (${dg.text.length} chars, ${dg.words.length} words)`);
        return { ...dg, provider: "deepgram" };
      }
    } else {
      logger?.warn(`${tag}: Deepgram returned empty, trying Qwen`);
    }
  } catch (err) {
    logger?.warn(`${tag}: Deepgram failed (${(err as Error).message?.slice(0, 120)}), trying Qwen`);
  }

  if (!qwenFits) {
    logger?.warn(`${tag}: file ${sizeBytes}B exceeds Qwen 10MB cap, no fallback`);
    return null;
  }
  onPhase?.("transcribing", { bytes: sizeBytes, provider: "qwen" });
  try {
    const qwen = await transcribeWithQwen(tempPath, mime);
    if (qwen) {
      logger?.info(`${tag}: Qwen fallback OK (${qwen.text.length} chars)`);
      return { ...qwen, provider: "qwen" };
    }
    logger?.warn(`${tag}: Qwen fallback returned empty`);
  } catch (err) {
    logger?.warn(`${tag}: Qwen fallback failed (${(err as Error).message?.slice(0, 160)})`);
  }
  return null;
}

// XHS path: pre-resolved CDN URLs, no proxy needed (rednotecdn unrestricted).
export async function transcribeFromStreams(
  streams: StreamCandidate[],
  opts: TranscribeOpts = {},
): Promise<AsrResult | null> {
  const { onPhase, logger, durationSec, tag = "ASR" } = opts;
  // Skip oversized audio before downloading (mirrors the YouTube path's cap).
  if (durationSec !== undefined && durationSec > MAX_AUDIO_DURATION_SEC) {
    logger?.warn(`${tag}: skipping audio ASR — duration ${durationSec}s > ${MAX_AUDIO_DURATION_SEC}s cap`);
    return null;
  }
  let tempPath: string | null = null;
  try {
    const sorted = [...streams]
      .filter((s) => s.url)
      .sort((a, b) => (a.sizeHint ?? Infinity) - (b.sizeHint ?? Infinity));
    if (sorted.length === 0) {
      logger?.warn(`${tag}: no streams with URLs`);
      return null;
    }

    onPhase?.("downloading");
    let chosen: StreamCandidate | null = null;
    for (let s = 0; s < sorted.length; s++) {
      const stream = sorted[s]!;
      try {
        tempPath = await downloadToTemp(
          stream.url,
          extensionForMime(stream.mimeType),
          2,
          logger,
        );
        chosen = stream;
        break;
      } catch (err) {
        logger?.warn(
          `${tag}: stream ${s + 1}/${sorted.length}${stream.label ? ` (${stream.label})` : ""} failed after retries: ${(err as Error).message?.slice(0, 120)}`,
        );
      }
    }
    if (!tempPath || !chosen) {
      logger?.warn(`${tag}: all ${sorted.length} streams failed to download`);
      return null;
    }
    const actualSize = statSync(tempPath).size;
    logger?.info(
      `${tag}: downloaded ${actualSize} bytes${chosen.label ? ` (${chosen.label})` : ""}`,
    );
    const mime = (chosen.mimeType ?? "audio/mp4").split(";")[0] ?? "audio/mp4";
    // XHS → Qwen3-ASR-Flash (Chinese-native); no audio fallback (Deepgram returns
    // gibberish on Chinese) — caller uses title-only text if this returns null.
    return await transcribeAtPath(tempPath, mime, actualSize, opts, true);
  } catch (err) {
    logger?.warn(`${tag} failed: ${(err as Error).message?.slice(0, 200) ?? err}`);
    return null;
  } finally {
    if (tempPath) {
      try {
        unlinkSync(tempPath);
      } catch {
        /* already gone */
      }
    }
  }
}

async function transcribeYoutubeOnce(
  videoId: string,
  session: ProxySession,
  opts: TranscribeOpts,
): Promise<{ result: AsrResult | null; bytes: number }> {
  const { logger, tag = `ASR ${videoId}`, onPhase } = opts;
  await ensureYtdlpBinary();

  // Caption-first: ~50KB vs 5-10MB audio download. Skip on caption miss or short text.
  let captionBotCheck: Error | null = null;
  try {
    onPhase?.("selecting");
    const captions = await getAutoCaptionsYtdlp(
      videoId,
      CAPTION_PREFER_LANGS,
      session.url,
      60_000,
      logger,
    );
    if (captions && captions.text.length >= CAPTION_MIN_CHARS) {
      logger?.info(
        `${tag}: YouTube auto-captions OK (${captions.text.length} chars, ${captions.words.length} words, lang=${captions.lang})`,
      );
      return {
        result: {
          text: captions.text,
          detectedLanguage: captions.lang,
          provider: "youtube_auto",
          words: captions.words,
        },
        // Approx json3 file size on proxy bandwidth — wealthproxies bills on
        // bytes-over-wire, not transcript text length.
        bytes: 50_000,
      };
    }
    if (captions) {
      logger?.warn(
        `${tag}: auto-captions returned ${captions.text.length} chars < ${CAPTION_MIN_CHARS} floor — falling through to audio ASR`,
      );
    } else {
      logger?.info(`${tag}: no auto-captions found, falling through to audio ASR`);
    }
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (classifyError(err, status) === "bot_check") captionBotCheck = err as Error;
    logger?.warn(`${tag}: caption attempt threw: ${(err as Error).message?.slice(0, 120)}`);
  }

  if (opts.durationSec !== undefined && opts.durationSec > MAX_AUDIO_DURATION_SEC) {
    if (captionBotCheck) throw captionBotCheck;
    logger?.info(
      `${tag}: skipping audio ASR — duration ${opts.durationSec}s > ${MAX_AUDIO_DURATION_SEC}s cap`,
    );
    return { result: null, bytes: 0 };
  }

  const outPath = join(
    tmpdir(),
    `singularity-asr-${videoId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.m4a`,
  );
  onPhase?.("downloading");
  try {
    const r = await downloadAudioWithYtdlp({ videoId, outPath, proxyUrl: session.url });
    if (r.code !== 0) {
      const stderr = r.stderr.slice(0, 300);
      const httpMatch = stderr.match(/HTTP Error (\d{3})/);
      const status = httpMatch ? Number(httpMatch[1]) : undefined;
      const err = new Error(`yt-dlp exit=${r.code} stderr=${stderr}`);
      (err as Error & { status?: number }).status = status;
      throw err;
    }
    if (!statSync(outPath).isFile()) {
      throw new Error(`yt-dlp finished but no output file at ${outPath}`);
    }
    const size = statSync(outPath).size;
    logger?.info(`${tag}: downloaded ${size} bytes via ${session.provider} session`);
    const asr = await transcribeAtPath(outPath, "audio/mp4", size, opts);
    return { result: asr, bytes: size };
  } finally {
    try {
      unlinkSync(outPath);
    } catch {
      /* already gone */
    }
  }
}

// High-level YouTube ASR: checks out session from pool, downloads via that session,
// reports outcome back to pool. Each retry checks out a fresh session (rotates IP).
export async function transcribeYoutubeVideo(
  videoId: string,
  pool: ProxyPool,
  opts: TranscribeOpts = {},
  maxAttempts = 3,
): Promise<AsrResult | null> {
  let lastErr: Error | undefined;
  let excludeProvider: string | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let session: ProxySession;
    try {
      session = pool.checkout({ excludeProvider });
    } catch (err) {
      opts.logger?.warn(`ASR ${videoId}: pool exhausted on attempt ${attempt}`);
      throw err;
    }
    try {
      const { result, bytes } = await transcribeYoutubeOnce(videoId, session, opts);
      pool.reportOk(session, bytes);
      return result;
    } catch (err) {
      lastErr = err as Error;
      const status = (err as Error & { status?: number }).status;
      const kind = classifyError(err, status);
      pool.reportErr(session, lastErr.message, kind);
      opts.logger?.warn(
        `ASR ${videoId}: attempt ${attempt}/${maxAttempts} via ${session.provider} failed (${kind}) — ${lastErr.message?.slice(0, 120)}`,
      );
      if (kind === "consecutive_403" || kind === "auth_failed") {
        excludeProvider = undefined;
      }
    }
  }
  opts.logger?.warn(
    `ASR ${videoId}: all ${maxAttempts} attempts exhausted (last: ${lastErr?.message?.slice(0, 120)})`,
  );
  return null;
}
