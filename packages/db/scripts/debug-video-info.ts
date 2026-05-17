import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env.local") });

const TOKEN = process.env.TIKHUB_API_KEY!;

async function inspect(id: string, endpoint = "/api/v1/youtube/web/get_video_info_v3") {
  const url = `https://api.tikhub.io${endpoint}?video_id=${id}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const json = (await res.json()) as { code?: number; data?: Record<string, unknown> };
  console.log(`\n=== ${id} ===`);
  console.log("code:", json.code);
  if (json.data) {
    const d = json.data;
    const fields = [
      "video_id",
      "title",
      "url",
      "video_url",
      "view_count",
      "length_seconds",
      "channel_id",
      "author",
      "publish_date",
    ];
    for (const f of fields) {
      const v = d[f];
      console.log(`  ${f}:`, v === undefined ? "(undefined)" : JSON.stringify(v).slice(0, 100));
    }
    const thumbnails = d.thumbnails as Array<{ url?: string; width?: number }> | undefined;
    console.log(`  thumbnails count:`, thumbnails?.length ?? 0);
    const captions = d.captions as Array<{ language_code?: string }> | undefined;
    console.log(`  captions count:`, captions?.length ?? 0);
    console.log(`  full top-level keys:`, Object.keys(d));
  } else {
    console.log("  no data, raw:", JSON.stringify(json).slice(0, 300));
  }
}

async function main() {
  // MKBHD videos from latest test
  const cases: Array<[string, string]> = [
    ["eFeDpUVEy48", "/api/v1/youtube/web_v2/get_video_info"],
    ["coX4duwUCpw", "/api/v1/youtube/web_v2/get_video_info"],
  ];
  for (const [id, ep] of cases) {
    console.log(`\n>>> ${ep}`);
    await inspect(id, ep);
    await new Promise((r) => setTimeout(r, 1500));
  }
}
main().catch(console.error);
