// Diagnose why a specific YouTube video produces transcript_source=null.
// Walks the same chain analyze-channel.ts uses: YT Data API → TikHub streams →
// download → Deepgram → Groq. Logs every step so we can see where it actually
// breaks instead of guessing.

import { config } from "dotenv";
config({ path: new URL("../../../.env.local", import.meta.url) });

import { fetchVideoMetadata } from "@singularity/shared/clients/youtube-data";
import { getAudioStreams, getVideoWithTranscript } from "@singularity/shared/clients/tikhub";
import { transcribeYoutubeVideo } from "@singularity/shared/clients/asr";

async function main() {
  const videoId = process.argv[2] ?? "EPUg9pmfPk0";
  console.log(`\n=== Diagnose ASR chain for ${videoId} ===\n`);

  console.log("[1] YouTube Data API metadata");
  const yt = await fetchVideoMetadata(videoId);
  if (!yt) {
    console.log("  ✗ no result (quota? key? network?)");
  } else {
    console.log(`  ✓ title:    ${yt.title}`);
    console.log(`  ✓ duration: ${yt.durationSec}s`);
    console.log(`  ✓ views:    ${yt.viewCount}`);
  }

  console.log("\n[2] TikHub get_video_info + captions");
  try {
    const { info, transcript } = await getVideoWithTranscript(videoId);
    console.log(`  info.title:        ${info.title || "(empty)"}`);
    console.log(`  info.duration_sec: ${info.duration_sec}`);
    console.log(`  info.captions[]:   ${info.captions.length} tracks`);
    if (info.captions.length > 0) {
      console.log(`    langs: ${info.captions.map((c) => c.language_code).join(", ")}`);
    }
    if (transcript) {
      console.log(`  ✓ transcript: ${transcript.text.length} chars (${transcript.languageCode})`);
    } else {
      console.log(`  ✗ no transcript (all caption tracks empty or absent)`);
    }
  } catch (err) {
    console.log(`  ✗ TikHub error: ${(err as Error).message}`);
  }

  console.log("\n[3] TikHub get_audio_streams");
  try {
    const streams = await getAudioStreams(videoId);
    console.log(`  ${streams.length} audio streams returned`);
    streams.slice(0, 4).forEach((s, i) => {
      console.log(
        `    [${i}] mime=${s.mime_type}  size=${s.content_length}  itag=${s.itag}  quality=${s.audio_quality ?? "?"}`,
      );
    });
    if (streams.length === 0) {
      console.log("  ✗ no audio streams — ASR cannot run");
    }
  } catch (err) {
    console.log(`  ✗ TikHub error: ${(err as Error).message}`);
  }

  console.log("\n[4] Full ASR pipeline (Deepgram primary, Groq fallback)");
  const startedAt = Date.now();
  const result = await transcribeYoutubeVideo(videoId, {
    logger: {
      info: (m) => console.log(`  · ${m}`),
      warn: (m) => console.log(`  ! ${m}`),
    },
    durationSec: yt?.durationSec ?? undefined,
    onPhase: (phase, ph) => {
      const sizeMB = ph?.bytes ? ` (${(ph.bytes / 1024 / 1024).toFixed(1)} MB)` : "";
      console.log(`  → phase: ${phase}${ph?.provider ? ` [${ph.provider}]` : ""}${sizeMB}`);
    },
  });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n  elapsed: ${elapsed}s`);
  if (result) {
    console.log(`  ✓ ASR success (${result.provider}): ${result.text.length} chars, lang=${result.detectedLanguage ?? "?"}`);
    console.log(`  first 200 chars: ${result.text.slice(0, 200)}...`);
  } else {
    console.log(`  ✗ ASR returned null — see warnings above for reason`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
