// Verify Qwen3-ASR-Flash (Alibaba Model Studio, Singapore) works from Node via the
// OpenAI-compatible endpoint, incl. base64 data-URI input (our XHS pipeline path).
// Run: pnpm --filter @singularity/db exec tsx scripts/qwen-asr-smoke.ts
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const KEY = process.env.DASHSCOPE_API_KEY!;
const BASE = process.env.DASHSCOPE_ASR_BASE_URL!;
const URL = `${BASE}/compatible-mode/v1/chat/completions`;
const SAMPLE = "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3";

async function call(label: string, audioData: string, asrOptsPlacement: "extra_body" | "top") {
  const body: Record<string, unknown> = {
    model: "qwen3-asr-flash",
    messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: audioData } }] }],
    stream: false,
  };
  const asrOptions = { enable_lid: true, enable_itn: false };
  if (asrOptsPlacement === "extra_body") body.extra_body = { asr_options: asrOptions };
  else body.asr_options = asrOptions;

  const t0 = Date.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  const text = await res.text();
  let transcript = "";
  try {
    const j = JSON.parse(text);
    transcript = j?.choices?.[0]?.message?.content ?? "";
  } catch { /* leave raw */ }
  console.log(`\n[${label}] (${asrOptsPlacement}) HTTP ${res.status} | ${ms}ms`);
  if (res.ok && transcript) console.log(`  transcript: ${JSON.stringify(transcript).slice(0, 300)}`);
  else console.log(`  raw: ${text.slice(0, 400)}`);
  return res.ok && !!transcript;
}

try {
  console.log("Qwen3-ASR-Flash smoke — endpoint:", URL);
  // A: public URL (auth + format sanity)
  await call("url", SAMPLE, "extra_body");
  await call("url", SAMPLE, "top");
  // B: base64 data-URI (our XHS temp-file path)
  const buf = Buffer.from(await (await fetch(SAMPLE)).arrayBuffer());
  const dataUri = `data:audio/mpeg;base64,${buf.toString("base64")}`;
  console.log(`\n(downloaded sample ${buf.length} bytes -> base64 ${dataUri.length} chars)`);
  await call("base64", dataUri, "extra_body");
  await call("base64", dataUri, "top");
} catch (e) {
  console.error("ERROR:", (e as Error).message);
  process.exit(1);
}
