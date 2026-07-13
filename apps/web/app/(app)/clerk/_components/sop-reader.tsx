import type { ReactNode } from "react";
import type { Components } from "react-markdown";

// Document reader for SOP markdown: a section TOC parsed from ## headings plus
// anchored, styled sections (.prose-sop in globals.css). Async server component +
// dynamic import for the same react-markdown ESM-interop reason as markdown.tsx.

function stripMd(s: string): string {
  return s.replace(/\*\*|__|`/g, "").trim();
}

// CJK letters are valid in ids/fragments — keep them, collapse the rest.
function slugify(s: string): string {
  const slug = stripMd(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "section";
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (typeof node === "object" && "props" in node) {
    return flattenText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export async function SopReader({ text, className }: { text: string; className?: string }) {
  const { default: ReactMarkdown } = await import("react-markdown");
  const { default: remarkGfm } = await import("remark-gfm");

  const sections = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => stripMd(m[1]!));

  const components: Components = {
    h2: ({ children }) => {
      const t = flattenText(children);
      return <h2 id={slugify(t)}>{children}</h2>;
    },
    h3: ({ children }) => {
      const t = flattenText(children);
      return <h3 id={slugify(t)}>{children}</h3>;
    },
    // Beat/spec tables are wider than the reading column — scroll them in place.
    table: ({ children }) => (
      <div className="sop-table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className={className}>
      {sections.length >= 3 ? (
        <nav aria-label="SOP 章节" className="mb-5 flex flex-wrap gap-1.5">
          {sections.map((s, i) => (
            <a
              key={`${slugify(s)}-${i}`}
              href={`#${slugify(s)}`}
              className="inline-flex max-w-64 items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-clerk/50 hover:text-foreground"
            >
              <span className="font-mono text-[10px] text-clerk">{i + 1}</span>
              <span className="truncate">{s}</span>
            </a>
          ))}
        </nav>
      ) : null}
      <div className="prose-sop">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text ?? ""}
        </ReactMarkdown>
      </div>
    </div>
  );
}
