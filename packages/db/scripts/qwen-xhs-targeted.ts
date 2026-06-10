// Validate the stream-selection fix against 表叔王寂 (h265 video-only + h264 audio).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { getXhsUserNotes } from "@singularity/shared/clients/xhs";
import { transcribeFromStreams } from "@singularity/shared/clients/asr";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const notes = await getXhsUserNotes("5c7c8de8000000001200f53d", 6);
const v = notes.find((n) => n.type === "video" && n.videoStreams.length > 0);
if (!v) { console.log("no video note"); process.exit(0); }
console.log(`note: ${v.title.slice(0, 30)} | streams: ${v.videoStreams.map((s) => `${s.codec}/${s.size}`).join(", ")}\n`);
const streams = v.videoStreams.map((s) => ({
  url: s.masterUrl,
  mimeType: "video/mp4",
  sizeHint: s.size,
  label: `${s.codec} ${s.width}x${s.height}`,
  codec: s.codec,
}));
const r = await transcribeFromStreams(streams, {
  logger: { info: (m) => console.log(`[info] ${m}`), warn: (m) => console.log(`[warn] ${m}`) },
  durationSec: v.durationSec ?? undefined,
  tag: "XHS-test",
});
console.log("\n" + (r ? `RESULT: provider=${r.provider} | ${r.text.length} chars | ${JSON.stringify(r.text.slice(0, 120))}` : "RESULT: null"));
process.exit(0);
