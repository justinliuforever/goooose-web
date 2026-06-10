// Find an audio format that BOTH the Debian ffmpeg (no libmp3lame) can produce AND
// Qwen accepts for REAL extracted XHS audio. Downloads one real XHS video, extracts
// several ways with local ffmpeg, POSTs each to Qwen.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getXhsUserNotes } from "@singularity/shared/clients/xhs";
import { clerkVideos } from "../src/schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });
const client = postgres(process.env.DATABASE_URL!, { prepare: false });
const db = drizzle(client);
const FF = "/opt/homebrew/bin/ffmpeg";
const VID = "/tmp/xhsvid.mp4";

async function qwen(path: string, mt: string): Promise<string> {
  const b64 = readFileSync(path).toString("base64");
  const res = await fetch(`${process.env.DASHSCOPE_ASR_BASE_URL}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "qwen3-asr-flash",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: `data:${mt};base64,${b64}` } }] }],
      stream: false,
      asr_options: { enable_lid: true, enable_itn: false, language: "zh" },
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return `HTTP ${res.status}: ${JSON.stringify(j).slice(0, 120)}`;
  const text = (j as any)?.choices?.[0]?.message?.content ?? "";
  return `HTTP 200 | ${text.length} chars | ${JSON.stringify(text.slice(0, 60))}`;
}

try {
  const rows = await db
    .select({ uid: clerkVideos.sourceChannelId })
    .from(clerkVideos)
    .where(and(eq(clerkVideos.contentType, "xhs_video"), isNotNull(clerkVideos.sourceChannelId)))
    .limit(40);
  const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))] as string[];
  let url: string | null = null;
  for (const uid of uids) {
    try {
      const notes = await getXhsUserNotes(uid, 10);
      const v = notes.find((n) => n.type === "video" && n.videoStreams.length > 0);
      if (v) { url = v.videoStreams.sort((a, b) => (a.size ?? 9e9) - (b.size ?? 9e9))[0]!.masterUrl; break; }
    } catch { /* next */ }
  }
  if (!url) throw new Error("no XHS video URL found");
  const buf = Buffer.from(await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer());
  writeFileSync(VID, buf);
  console.log(`downloaded ${buf.length}B video\n`);

  const variants = [
    { name: "wav 16k", out: "/tmp/x.wav", args: ["-vn", "-ac", "1", "-ar", "16000", "/tmp/x.wav"], mt: "audio/wav" },
    { name: "aac m4a +faststart", out: "/tmp/x.m4a", args: ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", "/tmp/x.m4a"], mt: "audio/mp4" },
    { name: "aac adts", out: "/tmp/x.aac", args: ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", "-f", "adts", "/tmp/x.aac"], mt: "audio/aac" },
    { name: "opus ogg", out: "/tmp/x.ogg", args: ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "32k", "/tmp/x.ogg"], mt: "audio/ogg" },
  ];
  for (const v of variants) {
    const r = spawnSync(FF, ["-y", "-i", VID, ...v.args], { encoding: "utf8" });
    if (r.status !== 0) { console.log(`${v.name}: ffmpeg FAILED (${r.status})`); continue; }
    const size = readFileSync(v.out).length;
    const q = await qwen(v.out, v.mt);
    console.log(`${v.name}: ${size}B -> ${q}`);
  }
} finally {
  await client.end();
}
