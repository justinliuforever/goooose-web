// Pure URL validators, browser-safe: imported by client-side form schemas, so
// this module must never pull in node-only APIs (the API clients do).

const XHS_USER_ID_RE = /^[a-f0-9]{24}$/i;

export function isValidYoutubeChannelUrl(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith("youtube.com") && !u.hostname.endsWith("youtu.be")) {
      return false;
    }
    const p = u.pathname;
    return (
      /^\/@[\w.-]+/.test(p) ||
      /^\/channel\/UC[\w-]+/.test(p) ||
      /^\/c\/[\w.-]+/.test(p) ||
      /^\/user\/[\w.-]+/.test(p)
    );
  } catch {
    return false;
  }
}

// Mobile share pastes wrap an xhslink.com short link in card text ("@昵称 … 查看Ta的主页>>
// https://xhslink.com/m/xxx"), so scan for an embedded URL instead of parsing the whole string.
const XHS_SHORT_LINK_RE = /https?:\/\/(?:[\w-]+\.)?xhslink\.com\/[^\s"'<>，。；！？]+/i;

export function findXhsShortLink(input: string): string | null {
  return input.match(XHS_SHORT_LINK_RE)?.[0] ?? null;
}

export function isValidXhsProfileUrl(input: string): boolean {
  const s = input.trim();
  if (!s) return false;
  if (XHS_USER_ID_RE.test(s)) return true;
  // Short links can't be verified here (browser-safe module, no network) — accept
  // them and let the server expand the redirect and validate the real target.
  if (findXhsShortLink(s)) return true;
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith("xiaohongshu.com")) return false;
    return /\/user\/profile\/[a-f0-9]{24}/i.test(u.pathname);
  } catch {
    return false;
  }
}
