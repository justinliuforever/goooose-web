"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { trpc } from "@/lib/trpc";

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
  kind: "bible" | "script";
};

type Props = {
  initialActive?: ActiveRun | null;
};

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

function translatePhase(phase: string | undefined): string {
  if (!phase) return "准备中…";
  const map: Record<string, string> = {
    "writing bible": "AI 生成圣经中",
    "loading context": "加载上下文",
    "writing script": "AI 写稿中",
    "humanizing script": "改写为真人口语",
    "saving script": "写入数据库",
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

export function PoetRunProgress({ initialActive }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [active, setActive] = useState<ActiveRun | null>(initialActive ?? null);
  const [startedAt, setStartedAt] = useState<number | null>(initialActive ? Date.now() : null);

  if (!active || !startedAt) return null;

  return (
    <ProgressCard
      active={active}
      startedAt={startedAt}
      onSettled={(ok, message) => {
        setActive(null);
        setStartedAt(null);
        if (ok) {
          toast.success(message ?? (active.kind === "bible" ? "圣经已生成" : "脚本已生成"));
          utils.invalidate();
          router.refresh();
        } else {
          toast.error(message ?? "运行失败");
        }
      }}
    />
  );
}

function ProgressCard({
  active,
  startedAt,
  onSettled,
}: {
  active: ActiveRun;
  startedAt: number;
  onSettled: (ok: boolean, message?: string) => void;
}) {
  const { run, error } = useRealtimeRun(active.triggerRunId, {
    accessToken: active.publicAccessToken,
  });
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
      if (active.kind === "bible") {
        const out = run.output as
          | { drifted?: boolean; driftReason?: string | null; topicClaimed?: string }
          | undefined;
        if (out?.drifted) {
          onSettled(true, `圣经已生成，但检测到偏题（${out.driftReason ?? "请查看"}）`);
        } else {
          onSettled(true, `圣经已生成${out?.topicClaimed ? ` · ${out.topicClaimed}` : ""}`);
        }
      } else {
        const out = run.output as
          | { wordCount?: number; targetWordCount?: number; humanized?: boolean }
          | undefined;
        const bits: string[] = [];
        if (out?.wordCount) bits.push(`${out.wordCount} 字`);
        if (out?.humanized) bits.push("已口语化");
        onSettled(true, bits.length > 0 ? `脚本已生成 · ${bits.join(" · ")}` : "脚本已生成");
      }
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
  }, [run, error, onSettled, active.kind]);

  const progress = run?.metadata?.progress as ProgressPayload | undefined;
  const phaseLabel = translatePhase(progress?.phase);
  const detail = progress?.detail;
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const elapsed = formatElapsed(now - startedAt);
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const kindLabel = active.kind === "bible" ? "生成圣经" : "写稿";

  return (
    <div className="flex w-80 flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {kindLabel} · {phaseLabel}
        </span>
        <span className="font-mono text-muted-foreground">{elapsed}</span>
      </div>
      {total > 0 ? (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-poet transition-all duration-500"
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
          <div className="h-full w-1/3 animate-pulse bg-poet" />
        </div>
      )}
      {detail ? <span className="line-clamp-2 text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}
