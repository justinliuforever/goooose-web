/**
 * Deepgram Nova-3 transcription smoke.
 * Target: the crypto video that Groq Whisper just failed on.
 * Run: pnpm --filter @singularity/db deepgram-smoke
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const TIKHUB = process.env.TIKHUB_API_KEY!;
const DEEPGRAM = process.env.DEEPGRAM_API_KEY!;
const VIDEO_ID = "8Ete4v-RaAQ"; // 一口氣搞懂 CLARITY 法案 (13:18, no captions)

type DgResponse = {
  metadata?: { duration?: number; channels?: number };
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string; confidence?: number }>;
      detected_language?: string;
    }>;
  };
  err_code?: string;
  err_msg?: string;
};

async function main() {
  if (!TIKHUB) throw new Error("TIKHUB_API_KEY missing");
  if (!DEEPGRAM) throw new Error("DEEPGRAM_API_KEY missing");

  console.log("Step 1: get audio URL from TikHub…");
  const streamsRes = await fetch(
    `https://api.tikhub.io/api/v1/youtube/web_v2/get_video_streams_v2?video_id=${VIDEO_ID}`,
    { headers: { Authorization: `Bearer ${TIKHUB}` } },
  );
  const streams = (await streamsRes.json()) as {
    data?: {
      adaptive_formats?: Array<{ mime_type: string; url?: string; content_length?: string }>;
      streams?: Array<{ mime_type: string; url?: string; content_length?: string }>;
    };
  };
  const audioOnly = [
    ...(streams.data?.adaptive_formats ?? []),
    ...(streams.data?.streams ?? []),
  ]
    .filter((s) => s.mime_type?.startsWith("audio/") && s.url)
    .sort(
      (a, b) =>
        Number(a.content_length ?? Infinity) - Number(b.content_length ?? Infinity),
    );
  const pick = audioOnly[0];
  if (!pick) {
    console.error("No audio stream found");
    return;
  }
  const mb = (Number(pick.content_length ?? 0) / 1024 / 1024).toFixed(2);
  console.log(`  smallest: ${pick.mime_type} ${mb}MB`);

  console.log("\nStep 2a: download audio bytes (server fetches with browser UA)…");
  const dlT0 = Date.now();
  const audioRes = await fetch(pick.url!, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!audioRes.ok) {
    console.error(`  download failed HTTP ${audioRes.status}`);
    return;
  }
  const audioBytes = new Uint8Array(await audioRes.arrayBuffer());
  console.log(
    `  downloaded ${(audioBytes.byteLength / 1024 / 1024).toFixed(2)}MB in ${((Date.now() - dlT0) / 1000).toFixed(1)}s`,
  );

  console.log("\nStep 2b: POST bytes to Deepgram Nova-3…");
  const t0 = Date.now();
  const mime = pick.mime_type?.split(";")[0] ?? "audio/mp4";
  const dgRes = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=zh&smart_format=true&punctuate=true",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM}`,
        "Content-Type": mime,
      },
      body: audioBytes,
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`  HTTP ${dgRes.status} (${elapsed}s)`);

  if (!dgRes.ok) {
    const body = await dgRes.text();
    console.error(`  body: ${body.slice(0, 400)}`);
    return;
  }

  const dg = (await dgRes.json()) as DgResponse;
  if (dg.err_code) {
    console.error(`  Deepgram error: ${dg.err_code} - ${dg.err_msg}`);
    return;
  }

  const transcript =
    dg.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
  const confidence =
    dg.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? 0;
  const detectedLang = dg.results?.channels?.[0]?.detected_language ?? "—";
  const duration = dg.metadata?.duration ?? 0;

  console.log(
    `\n  detected_language=${detectedLang}  audio_duration=${duration.toFixed(1)}s  confidence=${confidence.toFixed(3)}`,
  );
  console.log(`  transcript: ${transcript.length} chars`);
  console.log("\n=== Transcript head (first 800 chars) ===");
  console.log(transcript.slice(0, 800));
  console.log("\n=== Transcript tail (last 200 chars) ===");
  console.log(transcript.slice(-200));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
