"use client";

import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { trpc } from "@/lib/trpc";

type Props = {
  scriptId: string;
  scriptText: string;
  accountSlug: string;
  projectSlug: string;
};

export function ScriptDetailActions({ scriptId, scriptText, accountSlug, projectSlug }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [copied, setCopied] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const remove = trpc.poet.deleteScript.useMutation({
    onSuccess: () => {
      toast.success("已删除脚本");
      utils.invalidate();
      router.push(`/accounts/${encodeURIComponent(accountSlug)}/projects/${encodeURIComponent(projectSlug)}/poet`);
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
    onSettled: () => setPendingDelete(false),
  });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scriptText);
      setCopied(true);
      toast.success("已复制全文");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={handleCopy}>
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        {copied ? "已复制" : "复制全文"}
      </Button>
      <ConfirmDialog
        title="删除该脚本？"
        description="删除后选题会回到「待写稿」状态，可重新生成。"
        confirmLabel="删除"
        disabled={pendingDelete}
        onConfirm={() => {
          setPendingDelete(true);
          remove.mutate({ scriptId });
        }}
        trigger={
          <Button size="sm" variant="ghost" disabled={pendingDelete}>
            {pendingDelete ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            删除
          </Button>
        }
      />
    </div>
  );
}
