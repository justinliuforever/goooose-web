// Route XHS note links through the lazy token resolver (/api/xhs) so click-through
// always gets a fresh xsec_token. Non-XHS URLs (YouTube, etc.) pass through unchanged.
const XHS_NOTE = /xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-f0-9]{16,32})/i;

export function xhsGoHref(url: string | null | undefined): string {
  const m = (url ?? "").match(XHS_NOTE);
  return m ? `/api/xhs?note=${m[1]}` : (url ?? "");
}
