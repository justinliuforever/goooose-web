"use client";

import { AlertCircle, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
};

const AGENT_LABEL: Record<"clerk" | "muse" | "poet", string> = {
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

function elapsed(now: number, startedAt: Date | string): string {
  const min = Math.floor((now - new Date(startedAt).getTime()) / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60}m 前`;
}

export function ActiveRunsBanner({ channelId }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const listQuery = trpc.pipeline.listActive.useQuery(
    { channelId },
    { refetchInterval: 8_000, refetchOnWindowFocus: true },
  );

  const utils = trpc.useUtils();
  const cancel = trpc.pipeline.cancelRun.useMutation({
    onSuccess: () => {
      toast.success("已取消任务");
      void utils.pipeline.listActive.invalidate({ channelId });
    },
    onError: (err) => toast.error(err.message),
  });

  const runs = listQuery.data ?? [];
  if (runs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/40 dark:bg-amber-900/10">
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertCircle className="size-4" />
        <span className="font-medium">
          {runs.length} 个任务正在运行 / 等待 — 完成前无法启动同 agent 新任务
        </span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {runs.map((r) => {
          const isStale = now - new Date(r.startedAt).getTime() > 30 * 60 * 1000;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-md bg-background/80 px-2.5 py-1.5"
            >
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {AGENT_LABEL[r.agent as keyof typeof AGENT_LABEL] ?? r.agent}
              </Badge>
              <span className="text-xs text-foreground">
                {COMMAND_LABEL[r.command] ?? r.command}
              </span>
              {r.status === "running" ? (
                <Loader2 className="size-3 animate-spin text-amber-600" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  待启动
                </Badge>
              )}
              {r.status === "running" && (r.total ?? 0) > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
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
              <span className="font-mono text-[10px] text-muted-foreground">
                {elapsed(now, r.startedAt)}
              </span>
              {isStale ? (
                <Badge variant="outline" className="border-amber-500 text-[10px] text-amber-700">
                  超时
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
                onClick={() => cancel.mutate({ runId: r.id })}
                disabled={cancel.isPending}
              >
                <X className="size-3" />
                取消
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
