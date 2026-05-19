"use client";

import { Play, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { AgentTimeline, type Stage } from "@/components/agent-timeline";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const MUSE_STAGES: Stage[] = [
  {
    label: "解析对标频道",
    matches: (p) => p === "resolving competitors" || p === "fetching competitor videos",
  },
  {
    label: "抓取视频内容",
    matches: (p) => p === "fetching video metadata" || p === "transcribing audio",
  },
  { label: "AI 分类相关性", matches: (p) => p === "classifying video" },
  { label: "分析爆款触发", matches: (p) => p === "analyzing viral trigger" },
  { label: "生成选题", matches: (p) => p === "generating ideas" },
];

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

type Props = {
  channelId: string;
  channelName: string;
  competitorCount: number;
  initialActive?: (ActiveRun & { startedAt?: Date | string }) | null;
};

export function MuseRunButton({ channelId, channelName, competitorCount, initialActive }: Props) {
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

  const startMutation = trpc.muse.startMonitor.useMutation({
    onSuccess: (data) => {
      setActive(data);
      setStartedAt(Date.now());
      toast.info(`已开始巡视「${channelName}」的对标频道`);
    },
    onError: (err) => toast.error(`启动失败：${err.message}`),
  });

  const handleStart = () => {
    startMutation.mutate({ channelId, maxVideosPerCompetitor: 10, numIdeasPerVideo: 5, language: "zh" });
  };

  const disabled = startMutation.isPending || !!active || competitorCount === 0;

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={handleStart} disabled={disabled} size="sm">
        {active ? (
          <Loader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <Play data-icon="inline-start" />
        )}
        {active ? "巡视中…" : "开始巡视"}
      </Button>
      {competitorCount === 0 ? (
        <span className="text-xs text-muted-foreground">先添加对标频道再启动</span>
      ) : null}
      {active && startedAt ? (
        <MuseRunProgress
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
              toast.success(message ?? "巡视完成");
              utils.invalidate();
              router.refresh();
            } else {
              toast.error(message ?? "巡视失败");
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
  detail?: string;
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r > 0 ? `${r}s` : ""}`;
}

function MuseRunProgress({
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
        | {
            classified?: number;
            relevant?: number;
            ideasGenerated?: number;
            newCandidates?: number;
          }
        | undefined;
      const bits: string[] = [];
      if (out?.newCandidates != null) bits.push(`新视频 ${out.newCandidates}`);
      if (out?.relevant != null) bits.push(`相关 ${out.relevant}`);
      if (out?.ideasGenerated != null) bits.push(`选题 ${out.ideasGenerated}`);
      onSettled(true, bits.length > 0 ? bits.join(" · ") : "巡视完成");
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
  const phaseLabel = translatePhase(progress?.phase) ?? "准备中…";
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
        stages={MUSE_STAGES}
        currentPhase={progress?.phase}
        accentClass="text-muse"
      />
      {total > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-muse transition-all duration-500"
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
          <div className="h-full w-1/3 animate-pulse bg-muse" />
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
    "resolving competitors": "解析对标频道",
    "fetching competitor videos": "抓取对标视频列表",
    "fetching video metadata": "获取视频元数据",
    "transcribing audio": "音频转写中",
    "classifying video": "AI 分类中",
    "generating ideas": "生成选题中",
    "analyzing viral trigger": "分析爆款触发因素",
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
