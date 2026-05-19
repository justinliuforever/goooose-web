"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { AgentTimeline, type Stage } from "@/components/agent-timeline";
import { trpc } from "@/lib/trpc";

import { ClerkStartSheet } from "./clerk-start-sheet";

const CLERK_STAGES: Stage[] = [
  {
    label: "解析频道 / 视频",
    matches: (p) =>
      p === "resolving channel" || p === "resolving videos" || p === "fetching videos",
  },
  {
    label: "抓取视频元数据",
    matches: (p) =>
      p === "fetching video metadata" ||
      p === "fetching transcript" ||
      p === "transcribing audio",
  },
  {
    label: "AI 分析视频",
    matches: (p) =>
      p === "running analyzer" ||
      p === "running analyzer (no caption)" ||
      p === "analyzing thumbnail" ||
      p === "writing analysis",
  },
  {
    label: "生成 SOP",
    matches: (p) =>
      p === "compiling videos data" ||
      p === "generating human SOP" ||
      p === "generating AI reference SOP" ||
      p === "generating hottest video deep dive",
  },
];

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

type Props = {
  channelId: string;
  channelName: string;
  initialActive?: (ActiveRun & { startedAt?: Date | string }) | null;
};

export function ClerkRunButton({ channelId, channelName, initialActive }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [active, setActive] = useState<ActiveRun | null>(initialActive ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(
    initialActive?.startedAt
      ? new Date(initialActive.startedAt).getTime()
      : initialActive
        ? Date.now()
        : null,
  );

  return (
    <div className="flex flex-col items-end gap-2">
      {active ? (
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          分析中…
        </div>
      ) : (
        <ClerkStartSheet
          channelId={channelId}
          channelName={channelName}
          disabled={!!active}
          onStarted={(run) => {
            setActive(run);
            setStartedAt(Date.now());
          }}
        />
      )}
      {active && startedAt ? (
        <ClerkRunProgress
          triggerRunId={active.triggerRunId}
          accessToken={active.publicAccessToken}
          startedAt={startedAt}
          onProgressTick={() => {
            utils.invalidate();
            router.refresh();
          }}
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
  onProgressTick,
}: {
  triggerRunId: string;
  accessToken: string;
  startedAt: number;
  onSettled: (ok: boolean, message?: string) => void;
  onProgressTick: (phase: string | undefined) => void;
}) {
  const { run, error } = useRealtimeRun(triggerRunId, { accessToken });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fire onProgressTick ONLY when phase actually changes. Inline arrow callbacks
  // create new references each render — depending on them causes a refresh loop.
  const phase = (run?.metadata?.progress as ProgressPayload | undefined)?.phase;
  const lastPhaseRef = useRef<string | undefined>(undefined);
  const tickRef = useRef(onProgressTick);
  tickRef.current = onProgressTick;
  useEffect(() => {
    if (phase && phase !== lastPhaseRef.current) {
      lastPhaseRef.current = phase;
      tickRef.current(phase);
    }
  }, [phase]);

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
    <div className="flex w-72 flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{phaseLabel}</span>
        <span className="font-mono text-muted-foreground">{elapsed}</span>
      </div>
      <AgentTimeline
        stages={CLERK_STAGES}
        currentPhase={progress?.phase}
        accentClass="text-clerk"
      />
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
      ) : null}
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
    "resolving videos": "正在解析视频链接",
    "fetching channel info": "正在获取频道信息",
    "fetching videos": "正在抓取视频列表",
    "analyzing video": "正在分析视频",
    "fetching video metadata": "获取视频元数据",
    "fetching transcript": "获取字幕",
    "transcribing audio": "音频转写中",
    "running analyzer": "AI 分析中",
    "running analyzer (no caption)": "AI 分析中（无字幕）",
    "analyzing thumbnail": "视觉识别封面图",
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
