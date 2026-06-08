"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  scriptId: string;
};

export function DeleteScriptButton({ scriptId }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const remove = trpc.poet.deleteScript.useMutation({
    onSuccess: () => {
      toast.success("已删除脚本");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
    onSettled: () => setPending(false),
  });

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm("确定删除该脚本？删除后选题会回到「待写稿」状态，可重新生成。")) {
          return;
        }
        setPending(true);
        remove.mutate({ scriptId });
      }}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
    </Button>
  );
}
