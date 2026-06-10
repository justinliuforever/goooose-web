// Diagnose 表叔王寂 XHS streams: do they contain an audio track? (ffprobe each stream
// + try extraction). user id from the run trace profile URL.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getXhsUserNotes } from "@singularity/shared/clients/xhs";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const FF = "/opt/homebrew/bin/ffmpeg";
const FP = "/opt/homebrew/bin/ffprobe";
const UID = "5c7c8de8000000001200f53d"; // 表叔王寂

const notes = await getXhsUserNotes(UID, 6);
const vnote = notes.find((n) => n.type === "video" && n.videoStreams.length > 0);
if (!vnote) { console.log("no video note"); process.exit(0); }
console.log(`note: ${vnote.title.slice(0, 30)} | dur=${vnote.durationSec}s | ${vnote.videoStreams.length} streams\n`);

for (let i = 0; i < vnote.videoStreams.length; i++) {
  const s = vnote.videoStreams[i]!;
  const f = `/tmp/probe-${i}.mp4`;
  const buf = Buffer.from(await (await fetch(s.masterUrl, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer());
  writeFileSync(f, buf);
  const probe = spawnSync(FP, ["-v", "error", "-show_entries", "stream=index,codec_type,codec_name", "-of", "csv=p=0", f], { encoding: "utf8" });
  const ext = spawnSync(FF, ["-y", "-i", f, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", `/tmp/probe-${i}.m4a`], { encoding: "utf8" });
  const extErr = ext.status !== 0 ? ext.stderr.trim().split("\n").slice(-2).join(" | ") : "OK";
  console.log(`stream ${i}: codec=${s.codec} size=${s.size ?? "?"}B ${buf.length}B`);
  console.log(`  ffprobe streams: ${probe.stdout.trim().replace(/\n/g, " ; ")}`);
  console.log(`  extract -> ${extErr}\n`);
}
