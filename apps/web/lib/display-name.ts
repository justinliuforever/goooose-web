// XHS share titles wrap nicknames as "@nick's profile" (en) / "@nick的个人主页" (zh).
// The scraper strips these now, but rows fetched before that fix still carry the
// suffix — strip again at render time so headers never show "xxx's profile".
export function cleanProfileName(name: string): string {
  return name
    .replace(/^@/, "")
    // XHS emits U+2018 LEFT single quote in some locales — cover all three quote forms.
    .replace(/['’‘]s profile$/i, "")
    .replace(/的个人主页$/, "")
    .trim();
}
