import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/copy-button";
import { Markdown } from "@/components/markdown";
import { formatDateTime } from "@/lib/datetime";
import { sopTypeLabel } from "@/lib/sop-labels";

import { DeleteSopButton } from "../[slug]/_components/delete-sop-button";
import { UseSopInProjectButton } from "./use-sop-in-project-button";

// Single SOP card for all three surfaces (own channel / competitor / library) —
// the previous three copies had already drifted apart.
type SopLike = {
  id: string;
  sopType: string;
  language: string;
  contentMd: string;
  generatedAt: Date | null;
};

export function SopCard({
  sop,
  defaultOpen = false,
  sourceName,
  sourceVideoTitle,
  usedBy = 0,
  showDelete = false,
}: {
  sop: SopLike;
  defaultOpen?: boolean;
  // Competitor surfaces show provenance on the card itself.
  sourceName?: string;
  // hottest / single_video SOPs: title of the post this SOP dissects, so multiple
  // per-video breakdowns are tellable apart without expanding them.
  sourceVideoTitle?: string;
  usedBy?: number;
  showDelete?: boolean;
}) {
  const label = sopTypeLabel(sop.sopType);
  return (
    <details open={defaultOpen} className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {label}
          </Badge>
          {sourceVideoTitle ? (
            <Badge variant="outline" className="max-w-56 text-[10px]" title={sourceVideoTitle}>
              <span className="truncate">📄 {sourceVideoTitle}</span>
            </Badge>
          ) : null}
          {sourceName ? (
            <Badge variant="outline" className="text-[10px]">
              🎯 来自对标 · {sourceName.slice(0, 16)}
            </Badge>
          ) : null}
          {usedBy > 0 ? (
            <Badge variant="outline" className="text-[10px]">
              已用于 {usedBy} 个项目
            </Badge>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground uppercase">{sop.language}</span>
          <span className="font-mono text-xs text-muted-foreground">
            {(sop.contentMd?.length ?? 0).toLocaleString("en-US")} chars
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {formatDateTime(sop.generatedAt)}
          </span>
          {sop.sopType === "ai_reference" ? <UseSopInProjectButton sopId={sop.id} /> : null}
          <CopyButton text={sop.contentMd} label="复制" />
          {showDelete ? <DeleteSopButton sopId={sop.id} sopLabel={label} /> : null}
        </div>
      </summary>
      <SopContent text={sop.contentMd} />
    </details>
  );
}

export function SopContent({ text }: { text: string }) {
  return <Markdown text={text} className="max-w-3xl border-t pt-4" />;
}
