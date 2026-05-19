"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
  ideaId: string;
  ideaTitle: string;
  disabled?: boolean;
  disabledReason?: string;
};

const DURATIONS = [
  { minutes: 5, label: "5 分钟 · 短稿", hint: "≈ 1000 字，单次写出" },
  { minutes: 10, label: "10 分钟 · 长稿", hint: "≈ 2000 字，大纲→分段" },
  { minutes: 20, label: "20 分钟 · 长稿", hint: "≈ 4000 字，大纲→分段" },
  { minutes: 30, label: "30 分钟 · 长稿", hint: "≈ 6000 字，大纲→分段" },
] as const;

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

  const handlePick = (minutes: number) => {
    if (disabled && disabledReason) {
      toast.error(disabledReason);
      return;
    }
    setPending(true);
    mutation.mutate({ channelId, ideaId, durationMinutes: minutes, language: "zh" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline" disabled={disabled || pending}>
            {pending ? <Loader2 className="size-3 animate-spin" /> : <PenLine className="size-3" />}
            写稿
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>选择视频时长</DropdownMenuLabel>
          {DURATIONS.map((d) => (
            <DropdownMenuItem
              key={d.minutes}
              onSelect={() => handlePick(d.minutes)}
              disabled={disabled || pending}
              className="flex flex-col items-start gap-0.5"
            >
              <span className="text-sm">{d.label}</span>
              <span className="text-xs text-muted-foreground">{d.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
