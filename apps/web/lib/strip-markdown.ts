// Flatten markdown to a plain one-line-ish snippet for previews/teasers (line-clamp),
// so headings/bold/list markers and the machine "TOPIC:" prefix don't leak into the UI.
export function stripMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/^TOPIC:\s*/im, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\n{2,}/g, " · ")
    .replace(/\n/g, " ")
    .trim();
}
