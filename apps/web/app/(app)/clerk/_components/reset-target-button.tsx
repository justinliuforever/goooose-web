"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

type Target = { kind: "own"; channelId: string } | { kind: "competitor"; competitorAccountId: string };

export function ResetTargetButton({ target, name }: { target: Target; name: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const reset = trpc.clerk.resetTarget.useMutation({
    onSuccess: () => {
      toast.success(`已清空「${name}」的拆解，可重新开始`);
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`清空失败：${err.message}`),
    onSettled: () => setPending(false),
  });

  return (
    <ConfirmDialog
      title={`清空「${name}」的全部拆解？`}
      description="该账号已拆的全部视频和 SOP 会被删除，不可撤销；之后可重新分析。"
      confirmLabel="清空重建"
      disabled={pending}
      onConfirm={() => {
        setPending(true);
        reset.mutate(
          target.kind === "own"
            ? { channelId: target.channelId }
            : { competitorAccountId: target.competitorAccountId },
        );
      }}
      trigger={
        <Button size="sm" variant="ghost" disabled={pending} className="text-muted-foreground">
          {pending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <RotateCcw data-icon="inline-start" />
          )}
          清空重建
        </Button>
      }
    />
  );
}
