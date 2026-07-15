// One-off probe: do TikHub app_v2 responses carry xsec_token anywhere?
import { config } from "dotenv";
config({ path: new URL("../../../.env.local", import.meta.url) });

const BASE = "https://api.tikhub.io";
async function call(endpoint: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}${endpoint}?${qs}`, {
    headers: { Authorization: `Bearer ${process.env.TIKHUB_API_KEY}`, accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
}

// Deep-scan: every key path whose key OR string value smells like a token/share link
function scan(obj: unknown, re: RegExp, path = "", hits: string[] = []): string[] {
  if (hits.length > 40) return hits;
  if (Array.isArray(obj)) { obj.slice(0, 3).forEach((v, i) => scan(v, re, `${path}[${i}]`, hits)); return hits; }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (re.test(k)) hits.push(`KEY ${p} = ${JSON.stringify(v).slice(0, 160)}`);
      else if (typeof v === "string" && re.test(v)) hits.push(`VAL ${p} = ${v.slice(0, 160)}`);
      scan(v, re, p, hits);
    }
  }
  return hits;
}
const RE = /xsec|token|share_link|shareLink|xhslink/i;

const USER = "672a8c0a000000001d02d088"; // exploration account (known-good from smoke)

async function main() {
  console.log("== 1. get_user_posted_notes (the list feed that builds noteUrl) ==");
  const list = await call("/api/v1/xiaohongshu/app_v2/get_user_posted_notes", { user_id: USER, num: "10" });
  console.log("status:", list.status);
  const hits1 = scan(list.body, RE);
  console.log(hits1.length ? hits1.join("\n") : "  NO token-like fields anywhere in response");
  const notes: any[] = (list.body as any)?.data?.data?.notes ?? [];
  console.log(`  notes returned: ${notes.length}`);
  if (notes[0]) console.log("  first note top-level keys:", Object.keys(notes[0]).join(", "));

  const vid = notes.find((n) => n.type === "video");
  const img = notes.find((n) => n.type !== "video");
  for (const [label, n] of [["video", vid], ["image", img]] as const) {
    if (!n) continue;
    const id = String(n.cursor ?? n.id ?? "");
    console.log(`\n== 2. get_image_note_detail (${label} id=${id}) ==`);
    const d = await call("/api/v1/xiaohongshu/app_v2/get_image_note_detail", { note_id: id });
    console.log("status:", d.status);
    const h = scan(d.body, RE);
    console.log(h.length ? h.join("\n") : "  NO token-like fields");
    const nl = (d.body as any)?.data?.data?.[0]?.note_list?.[0];
    if (nl) console.log("  note_list[0] keys:", Object.keys(nl).join(", "));
    if (label === "video") {
      console.log(`\n== 3. get_video_note_detail (id=${id}) ==`);
      const v = await call("/api/v1/xiaohongshu/app_v2/get_video_note_detail", { note_id: id });
      console.log("status:", v.status);
      const hv = scan(v.body, RE);
      console.log(hv.length ? hv.join("\n") : "  NO token-like fields");
      const el = (v.body as any)?.data?.data?.[0];
      if (el) console.log("  data[0] keys:", Object.keys(el).join(", "));
    }
  }

  console.log("\n== 4. get_user_info ==");
  const u = await call("/api/v1/xiaohongshu/app_v2/get_user_info", { user_id: USER });
  console.log("status:", u.status);
  const hu = scan(u.body, RE);
  console.log(hu.length ? hu.join("\n") : "  NO token-like fields");
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
