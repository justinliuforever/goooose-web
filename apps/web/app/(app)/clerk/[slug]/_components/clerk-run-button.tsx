"use client";

import { Play, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

type Props = {
  channelId: string;
  channelName: string;
  /** Pre-populated when the page mounts with an in-flight run (refresh resilience). */
  initialActive?: ActiveRun | null;
};

export function ClerkRunButton({ channelId, channelName, initialActive }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [active, setActive] = useState<ActiveRun | null>(initialActive ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(
    initialActive ? Date.now() : null,
  );

  const startMutation = trpc.clerk.startAnalysis.useMutation({
    onSuccess: (data) => {
      setActive(data);
      setStartedAt(Date.now());
      toast.info(`已开始分析「${channelName}」`);
    },
    onError: (err) => toast.error(`启动失败：${err.message}`),
  });

  const handleStart = () => {
    startMutation.mutate({ channelId, limit: 3, language: "zh" });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        onClick={handleStart}
        disabled={startMutation.isPending || !!active}
        size="sm"
      >
        {active ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Play data-icon="inline-start" />
        )}
        {active ? "分析中…" : "开始分析"}
      </Button>
      {active && startedAt ? (
        <ClerkRunProgress
          triggerRunId={active.triggerRunId}
          accessToken={active.publicAccessToken}
          startedAt={startedAt}
          onSettled={(ok, message) => {
            setActive(null);
            setStartedAt(null);
            if (ok) {
              toast.success(message ?? "分析完成");
              utils.invalidate();
              router.refresh();
            } else {
              toast.error(message ?? "分析失败");
            }
          }}
        />
      ) : null}
    </div>
  );
}

type ProgressPayload = {
  current?: number;
  total?: number;
  phase?: string;
  phaseLabel?: string;
  detail?: string;
  estSecondsRemaining?: number;
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r > 0 ? `${r}s` : ""}`;
}

function ClerkRunProgress({
  triggerRunId,
  accessToken,
  startedAt,
  onSettled,
}: {
  triggerRunId: string;
  accessToken: string;
  startedAt: number;
  onSettled: (ok: boolean, message?: string) => void;
}) {
  const { run, error } = useRealtimeRun(triggerRunId, { accessToken });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (error) {
      onSettled(false, `错误：${error.message}`);
      return;
    }
    if (!run) return;
    if (run.status === "COMPLETED") {
      const out = run.output as
        | { analyzed?: number; total?: number; failed?: number; sopsGenerated?: number }
        | undefined;
      onSettled(
        true,
        `已分析 ${out?.analyzed ?? 0}/${out?.total ?? 0} 个视频${
          out?.failed ? `（${out.failed} 个失败）` : ""
        }${out?.sopsGenerated ? ` · 生成 ${out.sopsGenerated} 个 SOP` : ""}`,
      );
    } else if (
      run.status === "FAILED" ||
      run.status === "CANCELED" ||
      run.status === "CRASHED" ||
      run.status === "SYSTEM_FAILURE" ||
      run.status === "TIMED_OUT" ||
      run.status === "EXPIRED"
    ) {
      onSettled(false, run.error?.message ?? `运行${runStatusLabel(run.status)}`);
    }
  }, [run, error, onSettled]);

  const progress = run?.metadata?.progress as ProgressPayload | undefined;
  const phaseLabel = progress?.phaseLabel ?? translatePhase(progress?.phase) ?? "准备中…";
  const detail = progress?.detail;
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const elapsed = formatElapsed(now - startedAt);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="flex w-72 flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{phaseLabel}</span>
        <span className="font-mono text-muted-foreground">{elapsed}</span>
      </div>
      {total > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-clerk transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
            <span>
              {current}/{total}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      ) : (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-clerk" />
        </div>
      )}
      {detail ? (
        <span className="line-clamp-2 text-xs text-muted-foreground">{detail}</span>
      ) : null}
    </div>
  );
}

function translatePhase(phase: string | undefined): string | undefined {
  if (!phase) return undefined;
  const map: Record<string, string> = {
    "resolving channel": "正在解析频道 URL",
    "fetching channel info": "正在获取频道信息",
    "fetching videos": "正在抓取视频列表",
    "analyzing video": "正在分析视频",
    "fetching video metadata": "获取视频元数据",
    "fetching transcript": "获取字幕",
    "running analyzer": "DeepSeek V4 Pro 分析中",
    "running analyzer (no caption)": "DeepSeek V4 Pro 分析中（无字幕）",
    "writing analysis": "写入数据库",
    "compiling videos data": "汇总分析数据",
    "generating human SOP": "生成 SOP · 人类可读版",
    "generating AI reference SOP": "生成 SOP · AI 参考版",
    "generating hottest video deep dive": "生成热门视频深度解析",
  };
  return map[phase] ?? phase;
}

function runStatusLabel(status: string): string {
  const map: Record<string, string> = {
    FAILED: "失败",
    CANCELED: "已取消",
    CRASHED: "崩溃",
    SYSTEM_FAILURE: "系统错误",
    TIMED_OUT: "超时",
    EXPIRED: "过期",
  };
  return map[status] ?? status.toLowerCase().replace(/_/g, " ");
}
