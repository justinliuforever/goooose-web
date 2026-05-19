import { createReadStream, createWriteStream, readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import Groq from "groq-sdk";

import { getAudioStreams, type AudioStream } from "./tikhub";

const GROQ_FILE_LIMIT_BYTES = 25 * 1024 * 1024;
// YouTube CDN serves audio at roughly real-time playback speed (~12 KB/s
// observed) for non-browser origins. A 13-min audio file can take 6-7 minutes.
const DOWNLOAD_TIMEOUT_MS = 900_000;

let _groq: Groq | null = null;

function getGroq(): Groq {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY not set in env");
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groq;
}

function sortStreamsBySize(streams: AudioStream[]): AudioStream[] {
  return [...streams]
    .filter((s) => s.url)
    .sort(
      (a, b) =>
        Number(a.content_length ?? Infinity) - Number(b.content_length ?? Infinity),
    );
}

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

// YouTube CDN randomly terminates mid-stream for non-browser origins. Same URL
// retried often succeeds on the next attempt.
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

type DgResponse = {
  metadata?: { duration?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
      detected_language?: string;
    }>;
  };
  err_code?: string;
  err_msg?: string;
};

async function transcribeWithDeepgram(
  bytes: Uint8Array,
  mime: string,
): Promise<{ text: string; durationSec?: number; detectedLanguage?: string } | null> {
  if (!process.env.DEEPGRAM_API_KEY) return null;
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&punctuate=true",
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
  const transcript = dg.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? "";
  if (!transcript) return null;
  return {
    text: transcript,
    durationSec: dg.metadata?.duration,
    detectedLanguage: dg.results?.channels?.[0]?.detected_language,
  };
}

async function transcribeWithGroq(
  tempPath: string,
): Promise<{ text: string; durationSec?: number; detectedLanguage?: string } | null> {
  const result = await getGroq().audio.transcriptions.create({
    file: createReadStream(tempPath),
    model: "whisper-large-v3",
    response_format: "verbose_json",
  });
  const v = result as unknown as { text?: string; language?: string; duration?: number };
  const text = (v.text ?? "").trim();
  if (!text) return null;
  return { text, detectedLanguage: v.language, durationSec: v.duration };
}

export type AsrResult = {
  text: string;
  detectedLanguage?: string;
  durationSec?: number;
  provider: "deepgram" | "groq";
};

export type AsrPhase = "selecting" | "downloading" | "transcribing";

// Below this chars/sec rate Deepgram is almost certainly garbled (observed on
// CN+EN code-switching audio). Real speech is 5-15 chars/sec for both langs.
const MIN_CHARS_PER_SEC = 1;

// Returns null on any recoverable failure so the caller can skip without aborting.
// Tries Deepgram Nova-3 first (no size limit, ~2.5s typical). Falls back to Groq
// Whisper if Deepgram fails, returns empty, returns garbled output, AND the audio
// fits Groq's 25 MB cap.
export async function transcribeYoutubeVideo(
  videoId: string,
  opts: {
    onPhase?: (phase: AsrPhase, info?: { bytes?: number; provider?: string }) => void;
    logger?: { info: (msg: string) => void; warn: (msg: string) => void };
    durationSec?: number;
  } = {},
): Promise<AsrResult | null> {
  const { onPhase, logger, durationSec } = opts;
  let tempPath: string | null = null;
  try {
    onPhase?.("selecting");
    const streams = await getAudioStreams(videoId);
    const sorted = sortStreamsBySize(streams);
    if (sorted.length === 0) {
      logger?.warn(`ASR ${videoId}: no audio streams with URLs`);
      return null;
    }

    onPhase?.("downloading");
    let chosen: AudioStream | null = null;
    for (let s = 0; s < sorted.length; s++) {
      const stream = sorted[s]!;
      try {
        tempPath = await downloadToTemp(
          stream.url,
          extensionForMime(stream.mime_type),
          2,
          logger,
        );
        chosen = stream;
        break;
      } catch (err) {
        logger?.warn(
          `ASR ${videoId}: stream ${s + 1}/${sorted.length} (itag=${stream.itag}) failed after retries: ${(err as Error).message?.slice(0, 120)}`,
        );
      }
    }
    if (!tempPath || !chosen) {
      logger?.warn(`ASR ${videoId}: all ${sorted.length} streams failed to download`);
      return null;
    }
    const actualSize = statSync(tempPath).size;
    logger?.info(`ASR ${videoId}: downloaded ${actualSize} bytes (itag=${chosen.itag})`);

    const mime = (chosen.mime_type ?? "audio/mp4").split(";")[0] ?? "audio/mp4";

    // Try Deepgram first.
    onPhase?.("transcribing", { bytes: actualSize, provider: "deepgram" });
    try {
      const bytes = readFileSync(tempPath);
      const dg = await transcribeWithDeepgram(bytes, mime);
      if (dg) {
        const effectiveDur = durationSec ?? dg.durationSec;
        const ratio = effectiveDur && effectiveDur > 0 ? dg.text.length / effectiveDur : Infinity;
        if (effectiveDur && effectiveDur > 30 && ratio < MIN_CHARS_PER_SEC) {
          logger?.warn(
            `ASR ${videoId}: Deepgram returned ${dg.text.length} chars for ${effectiveDur}s audio (${ratio.toFixed(2)} chars/sec, likely garbled), trying Groq`,
          );
        } else {
          logger?.info(`ASR ${videoId}: Deepgram OK (${dg.text.length} chars)`);
          return { ...dg, provider: "deepgram" };
        }
      } else {
        logger?.warn(`ASR ${videoId}: Deepgram returned empty, trying Groq`);
      }
    } catch (err) {
      logger?.warn(
        `ASR ${videoId}: Deepgram failed (${(err as Error).message?.slice(0, 120)}), trying Groq`,
      );
    }

    // Groq fallback (only if file fits its 25 MB cap).
    if (actualSize > GROQ_FILE_LIMIT_BYTES) {
      logger?.warn(
        `ASR ${videoId}: Deepgram failed and file ${actualSize}B exceeds Groq 25MB cap`,
      );
      return null;
    }
    onPhase?.("transcribing", { bytes: actualSize, provider: "groq" });
    try {
      const groq = await transcribeWithGroq(tempPath);
      if (groq) {
        logger?.info(`ASR ${videoId}: Groq OK (${groq.text.length} chars)`);
        return { ...groq, provider: "groq" };
      }
      logger?.warn(`ASR ${videoId}: Groq returned empty`);
    } catch (err) {
      logger?.warn(
        `ASR ${videoId}: Groq failed (${(err as Error).message?.slice(0, 120)})`,
      );
    }
    return null;
  } catch (err) {
    logger?.warn(`ASR ${videoId} failed: ${(err as Error).message?.slice(0, 200) ?? err}`);
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
