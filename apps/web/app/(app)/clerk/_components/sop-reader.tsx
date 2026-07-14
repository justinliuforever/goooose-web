import type { ReactNode } from "react";
import type { Components } from "react-markdown";

import { SopToc, type TocItem } from "./sop-toc";

// Document reader for SOP markdown: a sticky section rail (SopToc) beside anchored,
// styled sections (.prose-sop in globals.css). Async server component + dynamic import
// for the same react-markdown ESM-interop reason as markdown.tsx.

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

export async function SopReader({
  text,
  className,
  idPrefix = "sop",
}: {
  text: string;
  className?: string;
  // Multiple SOP cards render on one page — prefix heading ids so identical
  // section names across cards don't produce duplicate ids / broken scroll-spy.
  idPrefix?: string;
}) {
  const { default: ReactMarkdown } = await import("react-markdown");
  const { default: remarkGfm } = await import("remark-gfm");

  const items: TocItem[] = [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => {
    const title = stripMd(m[1]!);
    return { id: `${idPrefix}-${slugify(title)}`, title };
  });

  const components: Components = {
    h2: ({ children }) => {
      const t = flattenText(children);
      return <h2 id={`${idPrefix}-${slugify(t)}`}>{children}</h2>;
    },
    h3: ({ children }) => {
      const t = flattenText(children);
      return <h3 id={`${idPrefix}-${slugify(t)}`}>{children}</h3>;
    },
    // Beat/spec tables are wider than the reading column — scroll them in place.
    table: ({ children }) => (
      <div className="sop-table-wrap">
        <table>{children}</table>
      </div>
    ),
  };

  // The rail (and the 2-col grid) only appear when SopToc renders — see its items>=3
  // guard. Without this the lone doc column would land in the 190px rail track.
  const railClass = items.length >= 3 ? " sop-reader--with-rail" : "";

  return (
    <div className={`sop-reader${railClass}${className ? ` ${className}` : ""}`}>
      <SopToc items={items} />
      <div className="prose-sop min-w-0">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text ?? ""}
        </ReactMarkdown>
      </div>
    </div>
  );
}
