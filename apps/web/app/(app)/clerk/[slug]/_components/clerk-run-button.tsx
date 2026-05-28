"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRealtimeRun } from "@trigger.dev/react-hooks";

import { trpc } from "@/lib/trpc";

import { ClerkPipelineProgress } from "./clerk-pipeline-progress";
import { ClerkStartSheet } from "./clerk-start-sheet";
import type { LogEntry } from "./activity-log";
import type { VideoTrack } from "./live-video-tracks";

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

type Props = {
  channelId: string;
  channelName: string;
  platform: "youtube" | "xhs";
  initialActive?: (ActiveRun & { startedAt?: Date | string }) | null;
};

export function ClerkRunButton({ channelId, channelName, platform, initialActive }: Props) {
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
          platform={platform}
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
  const log = (run?.metadata?.log as LogEntry[] | undefined) ?? [];
  const videoTracks =
    (run?.metadata?.videoTracks as Record<string, VideoTrack> | undefined) ?? {};

  return (
    <ClerkPipelineProgress
      phase={progress?.phase}
      detail={progress?.detail}
      current={progress?.current ?? 0}
      total={progress?.total ?? 0}
      startedAt={startedAt}
      log={log}
      videoTracks={videoTracks}
      allDone={run?.status === "COMPLETED"}
    />
  );
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
