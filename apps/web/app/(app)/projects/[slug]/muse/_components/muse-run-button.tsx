"use client";

import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

import { MuseStartSheet } from "./muse-start-sheet";

type Props = {
  channelId: string;
  channelName: string;
  competitorCount: number;
  isActive: boolean;
};

export function MuseRunButton({ channelId, channelName, competitorCount, isActive }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const cancelMutation = trpc.muse.cancelRun.useMutation({
    onSuccess: () => {
      toast.success("已取消巡视。再次启动会从已分类的相关视频继续生成选题。");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCancel = () => {
    if (!confirm("取消当前巡视？已分类的相关视频会保留，下次启动巡视时会自动补齐选题。")) return;
    cancelMutation.mutate({ channelId });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {isActive ? (
          <>
            <Button
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              size="sm"
              variant="outline"
              className="text-muted-foreground hover:text-destructive"
            >
              <X data-icon="inline-start" />
              {cancelMutation.isPending ? "取消中…" : "取消"}
            </Button>
            <Button disabled size="sm">
              <Loader2 data-icon="inline-start" className="animate-spin" />
              巡视中…
            </Button>
          </>
        ) : (
          <MuseStartSheet
            channelId={channelId}
            channelName={channelName}
            competitorCount={competitorCount}
            disabled={competitorCount === 0}
          />
        )}
      </div>
      {competitorCount === 0 ? (
        <span className="text-xs text-muted-foreground">先添加对标频道再启动</span>
      ) : null}
    </div>
  );
}
