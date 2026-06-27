"use client";

import { Loader2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

import { MuseStartSheet, type MuseCompetitor } from "./muse-start-sheet";

type Props = {
  channelId: string;
  channelName: string;
  competitors: MuseCompetitor[];
  isActive: boolean;
  accountSlug: string;
  projectSlug: string;
};

export function MuseRunButton({
  channelId,
  channelName,
  competitors,
  isActive,
  accountSlug,
  projectSlug,
}: Props) {
  const competitorCount = competitors.length;
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

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {isActive ? (
          <>
            <ConfirmDialog
              title="取消当前巡视？"
              description="已分类的相关视频会保留，下次启动巡视时会自动补齐选题。"
              confirmLabel="取消巡视"
              cancelLabel="继续巡视"
              disabled={cancelMutation.isPending}
              onConfirm={() => cancelMutation.mutate({ channelId })}
              trigger={
                <Button
                  disabled={cancelMutation.isPending}
                  size="sm"
                  variant="outline"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X data-icon="inline-start" />
                  {cancelMutation.isPending ? "取消中…" : "取消"}
                </Button>
              }
            />
            <Button disabled size="sm">
              <Loader2 data-icon="inline-start" className="animate-spin" />
              巡视中…
            </Button>
          </>
        ) : (
          <MuseStartSheet
            channelId={channelId}
            channelName={channelName}
            competitors={competitors}
            disabled={competitorCount === 0}
          />
        )}
      </div>
      {competitorCount === 0 ? (
        <Link
          href={`/accounts/${encodeURIComponent(accountSlug)}/projects/${encodeURIComponent(projectSlug)}`}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          先去绑定对标
        </Link>
      ) : null}
    </div>
  );
}
