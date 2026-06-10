"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Default project slug == account slug (D3 spine), so agent pages deep-link off channelSlug.
function deepLink(agent: string, channelSlug: string): string {
  const s = encodeURIComponent(channelSlug);
  if (agent === "clerk") return `/clerk/${s}`;
  if (agent === "muse" || agent === "poet") return `/accounts/${s}/projects/${s}/${agent}`;
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
  channelSlug: string;
  channelName: string;
};

export function GlobalRunsIndicator() {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
        description: r.channelName,
        action: {
          label: "查看",
          onClick: () => router.push(deepLink(r.agent, r.channelSlug)),
        },
      });
    }
  }, [listQuery.data, router]);

  if (runs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" />}
      >
        <Loader2 className="size-3.5 animate-spin text-amber-600" />
        <span className="font-mono text-xs">{runs.length}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">任务运行中</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>运行中的任务</DropdownMenuLabel>
        {runs.map((r) => (
          <DropdownMenuItem
            key={r.id}
            render={<Link href={deepLink(r.agent, r.channelSlug)} />}
            className="flex flex-col items-start gap-1 py-2"
          >
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
              <span className="truncate text-[11px] text-muted-foreground">{r.channelName}</span>
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
              ) : null}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
