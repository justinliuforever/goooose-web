"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActivityLog, type LogEntry } from "./activity-log";
import { LiveVideoTracks, type VideoTrack } from "./live-video-tracks";

type Stage = {
  id: string;
  label: string;
  matches: (phase: string) => boolean;
};

const CLERK_STAGES: Stage[] = [
  {
    id: "resolve",
    label: "解析频道 / 视频",
    matches: (p) =>
      p === "resolving channel" || p === "resolving videos" || p === "fetching videos",
  },
  {
    id: "metadata",
    label: "抓取视频元数据",
    matches: (p) =>
      p === "fetching video metadata" ||
      p === "fetching transcript" ||
      p === "transcribing audio",
  },
  {
    id: "analyze",
    label: "AI 分析视频",
    matches: (p) =>
      p === "running analyzer" ||
      p === "running analyzer (no caption)" ||
      p === "analyzing thumbnail" ||
      p === "writing analysis" ||
      p === "processing videos",
  },
  {
    id: "sops",
    label: "生成 SOP",
    matches: (p) =>
      p === "compiling videos data" ||
      p === "generating human SOP" ||
      p === "generating AI reference SOP" ||
      p === "generating hottest video deep dive" ||
      p === "generating SOPs",
  },
];

type Props = {
  phase: string | undefined;
  detail: string | undefined;
  current: number;
  total: number;
  startedAt: number;
  log: LogEntry[];
  videoTracks: Record<string, VideoTrack>;
  allDone?: boolean;
};

function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ClerkPipelineProgress({
  phase,
  detail,
  current,
  total,
  startedAt,
  log,
  videoTracks,
  allDone,
}: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (allDone) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [allDone]);

  // Track phase transition timestamps so we can show per-stage durations.
  const stageStartsRef = useRef<Record<string, number>>({});
  const lastStageIdxRef = useRef<number>(-1);

  const currentIdx = phase
    ? CLERK_STAGES.findIndex((s) => s.matches(phase))
    : -1;
  useEffect(() => {
    if (currentIdx === -1) return;
    if (currentIdx !== lastStageIdxRef.current) {
      const stageId = CLERK_STAGES[currentIdx]!.id;
      if (!stageStartsRef.current[stageId]) {
        stageStartsRef.current[stageId] = Date.now();
      }
      // Backfill: mark all previous stages as started (in case we missed events).
      for (let i = 0; i < currentIdx; i++) {
        const id = CLERK_STAGES[i]!.id;
        if (!stageStartsRef.current[id]) {
          stageStartsRef.current[id] = startedAt;
        }
      }
      lastStageIdxRef.current = currentIdx;
    }
  }, [currentIdx, startedAt]);

  const elapsed = now - startedAt;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const isAnalyzeStage = currentIdx === 2;
  const showTracks = isAnalyzeStage && Object.keys(videoTracks).length > 0;

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-lg border bg-card p-4 text-sm sm:w-[460px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allDone ? (
            <Check className="size-4.5 text-clerk" />
          ) : (
            <Loader2 className="size-4 animate-spin text-clerk" />
          )}
          <span className="text-sm font-medium text-foreground">
            {allDone ? "已完成" : phase ? "分析中" : "准备中…"}
          </span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{fmtElapsed(elapsed)}</span>
      </div>

      {total > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-clerk transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>
              {current}/{total}
            </span>
            <span>{pct}%</span>
          </div>
        </div>
      ) : null}

      <ol className="flex flex-col gap-2.5">
        {CLERK_STAGES.map((s, i) => {
          const isDone = allDone || i < currentIdx;
          const isCurrent = !allDone && i === currentIdx;
          const startedTs = stageStartsRef.current[s.id];
          const stageElapsed =
            startedTs && (isDone || isCurrent)
              ? Math.floor(
                  ((isCurrent ? now : stageStartsRef.current[CLERK_STAGES[i + 1]?.id ?? ""] ?? now) - startedTs) / 1000,
                )
              : null;
          return (
            <li key={s.id} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex size-5 shrink-0 items-center justify-center">
                  {isDone ? (
                    <Check className="size-4 text-clerk" />
                  ) : isCurrent ? (
                    <Loader2 className="size-4 animate-spin text-clerk" />
                  ) : (
                    <span className="size-2.5 rounded-full border border-muted-foreground/40" />
                  )}
                </span>
                <span
                  className={
                    isDone || isCurrent ? "text-sm text-foreground" : "text-sm text-muted-foreground"
                  }
                >
                  {s.label}
                </span>
                {stageElapsed !== null ? (
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {fmtSeconds(stageElapsed)}
                  </span>
                ) : null}
              </div>
              {isCurrent && detail ? (
                <span className="ml-7 line-clamp-2 text-xs text-muted-foreground">
                  {detail}
                </span>
              ) : null}
              {isCurrent && showTracks ? (
                <div className="ml-7">
                  <LiveVideoTracks tracks={videoTracks} now={now} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      <ActivityLog entries={log} defaultOpen={false} />
    </div>
  );
}
