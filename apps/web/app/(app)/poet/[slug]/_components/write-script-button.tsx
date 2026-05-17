"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
  ideaId: string;
  ideaTitle: string;
  disabled?: boolean;
  disabledReason?: string;
};

export function WriteScriptButton({
  channelId,
  ideaId,
  ideaTitle,
  disabled,
  disabledReason,
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const mutation = trpc.poet.generateScript.useMutation({
    onSuccess: () => {
      toast.info(`已开始为「${ideaTitle.slice(0, 30)}」写稿`);
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`启动失败：${err.message}`),
    onSettled: () => setPending(false),
  });

  const handleClick = () => {
    if (disabled && disabledReason) {
      toast.error(disabledReason);
      return;
    }
    setPending(true);
    mutation.mutate({ channelId, ideaId, durationMinutes: 5, language: "zh" });
  };

  return (
    <Button size="sm" variant="outline" disabled={disabled || pending} onClick={handleClick}>
      {pending ? <Loader2 className="size-3 animate-spin" /> : <PenLine className="size-3" />}
      写稿
    </Button>
  );
}
