"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type LogEntry = { ts: number; msg: string };

type Props = {
  entries: LogEntry[];
  defaultOpen?: boolean;
};

function formatTs(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

const MAX_RENDERED = 200;

export function ActivityLog({ entries, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rendered = entries.slice(-MAX_RENDERED);

  useEffect(() => {
    if (!open || !autoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [open, autoScroll, rendered.length]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setAutoScroll(atBottom);
  };

  const copyAll = async () => {
    const text = entries.map((e) => `[${formatTs(e.ts)}] ${e.msg}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${entries.length} 行日志`);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Toggle and copy are siblings — nesting a <Button> inside the toggle <button> is invalid HTML (hydration error). */}
      <div className="flex items-center justify-between rounded-md border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1.5 text-left"
        >
          <span className={`transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
          <span>实时日志</span>
          <span className="font-mono text-[10px] text-foreground/60">({entries.length})</span>
        </button>
        {open ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => void copyAll()}
          >
            <Copy className="size-3" />
            <span className="ml-1">复制</span>
          </Button>
        ) : null}
      </div>
      {open ? (
        <div
          ref={scrollerRef}
          onScroll={onScroll}
          className="max-h-56 overflow-y-auto rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed"
        >
          {rendered.length === 0 ? (
            <span className="text-muted-foreground/60">（暂无日志）</span>
          ) : (
            rendered.map((e, i) => (
              <div key={`${e.ts}-${i}`} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground/60">[{formatTs(e.ts)}]</span>
                <span className="break-words text-foreground/85">{e.msg}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
