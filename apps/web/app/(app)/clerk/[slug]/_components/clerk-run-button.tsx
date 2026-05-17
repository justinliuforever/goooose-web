"use client";

import { Play } from "lucide-react";
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
};

export function ClerkRunButton({ channelId, channelName }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [active, setActive] = useState<ActiveRun | null>(null);

  const startMutation = trpc.clerk.startAnalysis.useMutation({
    onSuccess: (data) => {
      setActive(data);
      toast.info(`Started Clerk analysis for ${channelName}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleStart = () => {
    startMutation.mutate({ channelId, limit: 3, language: "en" });
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleStart}
        disabled={startMutation.isPending || !!active}
        size="sm"
      >
        <Play data-icon="inline-start" />
        Run analysis
      </Button>
      {active ? (
        <ClerkRunProgress
          triggerRunId={active.triggerRunId}
          accessToken={active.publicAccessToken}
          onSettled={(ok, message) => {
            setActive(null);
            if (ok) {
              toast.success(message ?? "Analysis complete");
              utils.invalidate();
              router.refresh();
            } else {
              toast.error(message ?? "Analysis failed");
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
  title?: string;
};

function ClerkRunProgress({
  triggerRunId,
  accessToken,
  onSettled,
}: {
  triggerRunId: string;
  accessToken: string;
  onSettled: (ok: boolean, message?: string) => void;
}) {
  const { run, error } = useRealtimeRun(triggerRunId, { accessToken });

  useEffect(() => {
    if (error) {
      onSettled(false, error.message);
      return;
    }
    if (!run) return;
    if (run.status === "COMPLETED") {
      const out = run.output as { analyzed?: number; total?: number; failed?: number } | undefined;
      onSettled(
        true,
        `Analyzed ${out?.analyzed ?? 0}/${out?.total ?? 0}${out?.failed ? ` (${out.failed} failed)` : ""}`,
      );
    } else if (
      run.status === "FAILED" ||
      run.status === "CANCELED" ||
      run.status === "CRASHED" ||
      run.status === "SYSTEM_FAILURE" ||
      run.status === "TIMED_OUT" ||
      run.status === "EXPIRED"
    ) {
      onSettled(false, run.error?.message ?? `Run ${run.status.toLowerCase()}`);
    }
  }, [run, error, onSettled]);

  const progress = run?.metadata?.progress as ProgressPayload | undefined;
  const phase = progress?.phase ?? run?.status?.toLowerCase().replace(/_/g, " ") ?? "starting";
  const current = progress?.current ?? 0;
  const total = progress?.total ?? 0;

  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-xs text-muted-foreground">
        {phase}
        {total > 0 ? ` · ${current}/${total}` : ""}
      </span>
      {progress?.title ? (
        <span className="max-w-md truncate text-xs text-muted-foreground">{progress.title}</span>
      ) : null}
    </div>
  );
}
