"use client";

import { useRouter } from "next/navigation";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const AGENT_LABEL: Record<string, string> = {
  clerk: "Clerk",
  muse: "Muse",
  poet: "Poet",
};

const COMMAND_LABEL: Record<string, string> = {
  "clerk-analyze-channel": "频道分析",
  "clerk-detect-channel-series": "系列归类",
  "muse-monitor-competitors": "巡视对标",
  "poet-generate-bible": "频道圣经",
  "poet-analyze-custom-topic": "选题拆解",
  "poet-generate-script": "脚本生成",
};

// Default project slug == account slug, so agent pages deep-link off channelSlug.
// Competitor-target clerk runs (no slug) link to the competitor analysis page.
function deepLink(run: { agent: string; channelSlug: string | null; competitorAccountId: string | null }): string {
  if (run.competitorAccountId) return `/clerk/competitor/${run.competitorAccountId}`;
  const s = encodeURIComponent(run.channelSlug ?? "");
  if (run.agent === "clerk") return `/clerk/${s}`;
  if (run.agent === "muse" || run.agent === "poet") return `/accounts/${s}/projects/${s}/${run.agent}`;
  return "/";
}

function elapsed(now: number, startedAt: Date | string): string {
  const min = Math.floor((now - new Date(startedAt).getTime()) / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60}m`;
}

type RunRow = {
  id: string;
  agent: string;
  command: string;
  status: string;
  startedAt: Date | string;
  progress: number | null;
  total: number | null;
  channelSlug: string | null;
  competitorAccountId: string | null;
  targetName: string;
};

function GlobalRunsIndicatorInner() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Hand-rolled popover (no portal, no menu semantics): plain conditional div with
  // outside-click + Escape dismissal — nothing here can take down the page.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const listQuery = trpc.pipeline.listActiveAll.useQuery(undefined, {
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const runs: RunRow[] = listQuery.data ?? [];

  // Cross-page finish notification: when a previously-seen run id leaves the active set,
  // surface a toast with a deep link. Skip the first load (no baseline to diff against).
  const prevRef = useRef<Map<string, RunRow> | null>(null);
  useEffect(() => {
    if (!listQuery.data) return;
    const current = new Map(listQuery.data.map((r) => [r.id, r]));
    const prev = prevRef.current;
    prevRef.current = current;
    if (!prev) return;
    for (const [id, r] of prev) {
      if (current.has(id)) continue;
      toast(`${AGENT_LABEL[r.agent] ?? r.agent} · ${COMMAND_LABEL[r.command] ?? r.command} 已结束`, {
        description: r.targetName,
        action: {
          label: "查看",
          onClick: () => router.push(deepLink(r)),
        },
      });
    }
  }, [listQuery.data, router]);

  if (runs.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Loader2 className="size-3.5 animate-spin text-amber-600" />
        <span className="font-mono text-xs">{runs.length}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">任务运行中</span>
      </Button>
      {open ? (
        <div className="absolute top-full right-0 z-50 mt-1.5 w-80 rounded-md border bg-popover p-1.5 text-popover-foreground shadow-md">
          <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">运行中的任务</p>
          <div className="flex flex-col gap-0.5">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-col gap-1 rounded-md px-2 py-2 text-sm">
                <span className="flex w-full items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase">
                    {AGENT_LABEL[r.agent] ?? r.agent}
                  </Badge>
                  <span className="text-xs">{COMMAND_LABEL[r.command] ?? r.command}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {r.status === "pending" ? "待启动" : elapsed(now, r.startedAt)}
                  </span>
                </span>
                <span className="flex w-full items-center gap-2">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.targetName}
                  </span>
                  {r.status === "running" && (r.total ?? 0) > 0 ? (
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <span className="h-1 w-14 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-amber-500 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.round(((r.progress ?? 0) / (r.total ?? 1)) * 100))}%`,
                          }}
                        />
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {r.progress ?? 0}/{r.total}
                      </span>
                    </span>
                  ) : (
                    <Loader2 className="ml-auto size-3 animate-spin text-amber-600" />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// A status indicator must never be able to take the page down with it: any render
// error inside collapses to "no indicator" instead of the route error screen.
class IndicatorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GlobalRunsIndicator() {
  return (
    <IndicatorBoundary>
      <GlobalRunsIndicatorInner />
    </IndicatorBoundary>
  );
}
