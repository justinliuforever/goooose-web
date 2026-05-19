"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { PoetBible } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { trpc } from "@/lib/trpc";

type Props = {
  bibles: PoetBible[];
};

export function BibleHistory({ bibles }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const activate = trpc.poet.activateBible.useMutation({
    onSuccess: () => {
      toast.success("已切换激活版本");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`切换失败：${err.message}`),
    onSettled: () => setPendingId(null),
  });

  const remove = trpc.poet.deleteBible.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
    onSettled: () => setPendingId(null),
  });

  const inactive = bibles.filter((b) => !b.isActive);
  if (inactive.length === 0) return null;

  return (
    <details className="flex flex-col gap-3 rounded-lg border bg-card/40 p-4">
      <summary className="flex cursor-pointer items-center justify-between gap-3 list-none [&::-webkit-details-marker]:hidden">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          圣经历史版本（{inactive.length}）
        </span>
        <span className="text-xs text-muted-foreground">点击展开</span>
      </summary>
      <div className="flex flex-col gap-2 border-t pt-3">
        {inactive.map((b) => (
          <div
            key={b.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
          >
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{b.name}</span>
                {b.isActive ? (
                  <Badge variant="secondary" className="text-[10px]">
                    生效中
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    历史版本
                  </Badge>
                )}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {formatDateTime(b.updatedAt)} · {b.content.length.toLocaleString("en-US")} 字
              </span>
            </div>
            <div className="flex items-center gap-1">
              {!b.isActive ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendingId !== null}
                  onClick={() => {
                    setPendingId(b.id);
                    activate.mutate({ bibleId: b.id });
                  }}
                >
                  {pendingId === b.id && activate.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  激活
                </Button>
              ) : null}
              {!b.isActive ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingId !== null}
                  onClick={() => {
                    if (!confirm(`确定删除「${b.name}」？`)) return;
                    setPendingId(b.id);
                    remove.mutate({ bibleId: b.id });
                  }}
                >
                  {pendingId === b.id && remove.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
