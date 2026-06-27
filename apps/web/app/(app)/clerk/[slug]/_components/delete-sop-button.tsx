"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

type Props = {
  sopId: string;
  sopLabel: string;
};

export function DeleteSopButton({ sopId, sopLabel }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const remove = trpc.clerk.deleteSop.useMutation({
    onSuccess: () => {
      toast.success("已删除 SOP");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
    onSettled: () => setPending(false),
  });

  return (
    <ConfirmDialog
      title={`删除「${sopLabel}」SOP？`}
      description="删除后无法恢复。"
      confirmLabel="删除"
      disabled={pending}
      onConfirm={() => {
        setPending(true);
        remove.mutate({ sopId });
      }}
      trigger={
        <Button size="sm" variant="ghost" disabled={pending}>
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
        </Button>
      }
    />
  );
}
