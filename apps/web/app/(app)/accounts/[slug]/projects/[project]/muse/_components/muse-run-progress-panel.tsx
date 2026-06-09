"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { AgentTimeline, type Stage } from "@/components/agent-timeline";
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

type ProgressPayload = {
  current?: number;
  total?: number;
  phase?: string;
  detail?: string;
};

export type LiveStats = {
  monitored: number;
  relevant: number;
  irrelevant: number;
  ideas: number;
};

export type LastProcessed = {
  title: string;
  sourceChannelName: string | null;
  relevant: boolean | null;
  topicClassification: string | null;
  transcriptLength: number;
} | null;

type Props = {
  triggerRunId: string;
  accessToken: string;
  startedAt: Date | string | null;
  liveStats: LiveStats;
  lastProcessed: LastProcessed;
};

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${r > 0 ? `${r}s` : ""}`;
}

function translatePhase(phase: string | undefined): string {
  if (!phase) return "准备中…";
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

const TERMINAL_STATUS = new Set([
  "FAILED",
  "CANCELED",
  "CRASHED",
  "SYSTEM_FAILURE",
  "TIMED_OUT",
  "EXPIRED",
]);

const STATUS_LABEL: Record<string, string> = {
  FAILED: "失败",
  CANCELED: "已取消",
  CRASHED: "崩溃",
  SYSTEM_FAILURE: "系统错误",
  TIMED_OUT: "超时",
  EXPIRED: "过期",
};

export function MuseRunProgressPanel({
  triggerRunId,
  accessToken,
  startedAt,
  liveStats,
  lastProcessed,
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { run, error } = useRealtimeRun(triggerRunId, { accessToken });

  const [now, setNow] = useState(() => Date.now());
  const startedMs = startedAt ? new Date(startedAt).getTime() : now;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const progressData = run?.metadata?.progress as ProgressPayload | undefined;
  const phase = progressData?.phase;
  const current = progressData?.current ?? 0;
  const total = progressData?.total ?? 0;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const elapsed = formatElapsed(now - startedMs);
  const phaseLabel = translatePhase(phase);

  // Refresh on phase OR count change; 5s timer covers long ASR sits (90s+).
  const lastPhaseRef = useRef<string | undefined>(undefined);
  const lastCurrentRef = useRef<number>(0);
  useEffect(() => {
    const phaseChanged = phase && phase !== lastPhaseRef.current;
    const currentChanged = current !== lastCurrentRef.current;
    if (phaseChanged || currentChanged) {
      lastPhaseRef.current = phase;
      lastCurrentRef.current = current;
      utils.invalidate();
      router.refresh();
    }
  }, [phase, current, utils, router]);

  useEffect(() => {
    const id = setInterval(() => {
      utils.invalidate();
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [utils, router]);

  useEffect(() => {
    if (error) {
      toast.error(`错误：${error.message}`);
      router.refresh();
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
      toast.success(bits.length > 0 ? bits.join(" · ") : "巡视完成");
      router.refresh();
    } else if (TERMINAL_STATUS.has(run.status)) {
      toast.error(run.error?.message ?? `运行${STATUS_LABEL[run.status] ?? run.status}`);
      router.refresh();
    }
  }, [run, error, router]);

  return (
    <section className="grid grid-cols-1 gap-4 rounded-lg border bg-card p-5 lg:grid-cols-[5fr_7fr]">
<div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="size-3.5 animate-spin text-muse" />
            {phaseLabel}
          </span>
          <span className="font-mono text-xs text-muted-foreground">{elapsed}</span>
        </div>

        <AgentTimeline stages={MUSE_STAGES} currentPhase={phase} accentClass="text-muse" />

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

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-dashed bg-background/40 p-3">
          <Stat label="已抓取" value={liveStats.monitored} />
          <Stat
            label="已分类"
            value={liveStats.monitored}
            sub={`${liveStats.relevant} 相关 / ${liveStats.irrelevant} 排除`}
          />
          <Stat label="已出选题" value={liveStats.ideas} />
          <Stat label="预计选题" value={liveStats.relevant * 5} dim hint="每相关视频约 5 个" />
        </div>

        <p className="text-[10px] leading-snug text-muted-foreground">
          选题在所有视频分类完成后批量生成。短视频/笔记需要约 1 分钟分类，长视频需要 2-3 分钟（含音频转写）。
        </p>
      </div>

<div className="flex flex-col gap-3">
        <CurrentItemCard detail={progressData?.detail ?? null} fallbackPhase={phaseLabel} />
        <LastProcessedCard last={lastProcessed} />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  hint,
  dim,
}: {
  label: string;
  value: number;
  sub?: string;
  hint?: string;
  dim?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${dim ? "opacity-60" : ""}`}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono text-lg leading-none">{value}</span>
      {sub ? (
        <span className="text-[10px] text-muted-foreground">{sub}</span>
      ) : hint ? (
        <span className="text-[10px] italic text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

function CurrentItemCard({
  detail,
  fallbackPhase,
}: {
  detail: string | null;
  fallbackPhase: string;
}) {
  // detail format: "[3/10] My Take on The New Apple · 该视频..." — split title/sub-phase.
  let title = detail ?? "等待中…";
  let sub = fallbackPhase;
  const m = title.match(/^\[\d+\/\d+\]\s*(.+?)\s*·\s*(.+)$/);
  if (m) {
    title = m[1]!;
    sub = m[2]!;
  } else {
    const m2 = title.match(/^\[\d+\/\d+\]\s*(.+)$/);
    if (m2) title = m2[1]!;
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <Loader2 className="size-3 animate-spin text-muse" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          正在分析
        </span>
      </div>
      <div className="line-clamp-2 text-sm font-medium leading-snug">{title}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function LastProcessedCard({ last }: { last: LastProcessed }) {
  if (!last) {
    return (
      <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          上一条已分类
        </span>
        <span className="text-xs text-muted-foreground">还未有完成的视频</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background p-3">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        上一条已分类
      </span>
      <div className="flex items-center gap-2">
        {last.relevant === true ? (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            ✓ 相关
          </span>
        ) : last.relevant === false ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            已排除
          </span>
        ) : null}
        <span className="text-[10px] text-muted-foreground">
          {last.sourceChannelName ?? "—"}
        </span>
      </div>
      <div className="line-clamp-2 text-sm font-medium leading-snug">{last.title}</div>
      {last.topicClassification ? (
        <div className="text-xs text-muted-foreground">
          <span className="font-mono">topic:</span> {last.topicClassification}
        </div>
      ) : null}
      <div className="font-mono text-[10px] text-muted-foreground">
        transcript: {last.transcriptLength} chars
      </div>
    </div>
  );
}
