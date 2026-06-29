// Shared markdown renderer. Async server component + dynamic import keeps the markdown
// bundle server-side and sidesteps react-markdown v10's pure-ESM interop. No rehype-raw —
// the content is LLM-generated, so raw HTML stays escaped. Styling is the hand-written
// .prose-clerk class (globals.css), not @tailwindcss/typography.
export async function Markdown({ text, className }: { text: string; className?: string }) {
  const { default: ReactMarkdown } = await import("react-markdown");
  const { default: remarkGfm } = await import("remark-gfm");
  return (
    <div className={`prose-clerk text-sm leading-relaxed${className ? ` ${className}` : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text ?? ""}</ReactMarkdown>
    </div>
  );
}
