// A/B: Qwen3-ASR-Flash vs Deepgram nova-3 on the SAME audio (English + Chinese),
// same config as production. Decides whether to unify on Qwen primary + Deepgram
// fallback. Run: pnpm --filter @singularity/db exec tsx scripts/qwen-vs-deepgram.ts
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const DG_KEY = process.env.DEEPGRAM_API_KEY!;
const QWEN_KEY = process.env.DASHSCOPE_API_KEY!;
const QWEN_BASE = process.env.DASHSCOPE_ASR_BASE_URL!;

const SAMPLES = [
  { label: "EN · NASA spacewalk", url: "https://dpgr.am/spacewalk.wav", mime: "audio/wav" },
  { label: "ZH · welcome", url: "https://dashscope.oss-cn-beijing.aliyuncs.com/audios/welcome.mp3", mime: "audio/mpeg" },
];

async function deepgram(bytes: Uint8Array, mime: string) {
  const t0 = Date.now();
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-3&language=multi&smart_format=true&punctuate=true&utterances=true",
    { method: "POST", headers: { Authorization: `Token ${DG_KEY}`, "Content-Type": mime }, body: bytes },
  );
  const ms = Date.now() - t0;
  if (!res.ok) return { ms, text: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`, lang: "" };
  const j: any = await res.json();
  const alt = j?.results?.channels?.[0]?.alternatives?.[0];
  return { ms, text: (alt?.transcript ?? "").trim(), lang: j?.results?.channels?.[0]?.detected_language ?? "" };
}

async function qwen(bytes: Uint8Array, mime: string) {
  const t0 = Date.now();
  const dataUri = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const res = await fetch(`${QWEN_BASE}/compatible-mode/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${QWEN_KEY}`, "Content-Type": "application/json" },
    // language omitted => auto-detect (fair vs Deepgram language=multi)
    body: JSON.stringify({
      model: "qwen3-asr-flash",
      messages: [{ role: "user", content: [{ type: "input_audio", input_audio: { data: dataUri } }] }],
      stream: false,
      asr_options: { enable_lid: true, enable_itn: false },
    }),
  });
  const ms = Date.now() - t0;
  if (!res.ok) return { ms, text: `HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`, lang: "" };
  const j: any = await res.json();
  const lang = j?.choices?.[0]?.message?.annotations?.find((a: any) => a.type === "audio_info")?.language ?? "";
  return { ms, text: (j?.choices?.[0]?.message?.content ?? "").trim(), lang };
}

for (const s of SAMPLES) {
  const bytes = new Uint8Array(await (await fetch(s.url)).arrayBuffer());
  console.log(`\n==== ${s.label} (${(bytes.length / 1024).toFixed(0)} KB) ====`);
  const [dg, qw] = await Promise.all([deepgram(bytes, s.mime), qwen(bytes, s.mime)]);
  console.log(`  Deepgram nova-3 | ${dg.ms}ms | lang=${dg.lang} | ${JSON.stringify(dg.text.slice(0, 260))}`);
  console.log(`  Qwen3-ASR-Flash | ${qw.ms}ms | lang=${qw.lang} | ${JSON.stringify(qw.text.slice(0, 260))}`);
}
