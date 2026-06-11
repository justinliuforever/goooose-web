"use client";

import { ExternalLink } from "lucide-react";

import type { CheckedFact, CustomTopicReference } from "@singularity/db";

import { badgeVariants } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function SourceBadge({ src, reference }: { src: string; reference?: CustomTopicReference }) {
  const base = cn(badgeVariants({ variant: "outline" }), "max-w-[16ch] gap-1 text-[10px]");
  const trigger = reference?.url ? (
    <a href={reference.url} target="_blank" rel="noopener noreferrer" className={base}>
      <span className="truncate">{src}</span>
      <ExternalLink className="size-2.5 shrink-0" />
    </a>
  ) : (
    <span className={cn(base, "cursor-help")}>
      <span className="truncate">{src}</span>
    </span>
  );
  const snippet = reference?.text?.trim().slice(0, 160);
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent side="top" className="flex max-w-xs flex-col items-start gap-1 text-left">
        <span className="font-medium">{reference?.title ?? src}</span>
        {reference?.url ? <span className="break-all opacity-80">{reference.url}</span> : null}
        {snippet ? <span className="opacity-70">{snippet}…</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

function StatusBadge({ status }: { status: CheckedFact["status"] }) {
  const cls = "shrink-0 text-[10px]";
  if (status === "disputed") {
    return <span className={cn(badgeVariants({ variant: "warning" }), cls)}>⚠ 存疑</span>;
  }
  if (status === "unsupported") {
    return <span className={cn(badgeVariants({ variant: "destructive" }), cls)}>✗ 无依据</span>;
  }
  return <span className={cn(badgeVariants({ variant: "success" }), cls)}>✓ 已核实</span>;
}

// Disputed facts are marked (with the suggested correction) but never edited.
export function PoetFactList({
  facts,
  references,
}: {
  facts: CheckedFact[];
  references: CustomTopicReference[];
}) {
  if (facts.length === 0) return null;
  const refByTitle = new Map(
    references.filter((r) => r.title).map((r) => [r.title!, r] as const),
  );
  return (
    <TooltipProvider>
      <ul className="flex flex-col gap-2">
        {facts.map((f, i) => (
          <li
            key={i}
            className="flex flex-col gap-1 border-b border-border/40 pb-2 last:border-0 last:pb-0"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm">{f.fact}</span>
              <div className="flex shrink-0 items-center gap-1.5">
                {f.src ? <SourceBadge src={f.src} reference={refByTitle.get(f.src)} /> : null}
                <StatusBadge status={f.status} />
              </div>
            </div>
            {f.status !== "verified" && f.note ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">↳ {f.note}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </TooltipProvider>
  );
}
