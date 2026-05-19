"use client";

import { Loader2, PenLine, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  topicId: string;
  topicLabel: string;
  status: "draft" | "analyzed" | "scripted";
  hasActiveBible: boolean;
};

const DURATIONS = [
  { minutes: 5, label: "5 分钟 · 短稿", hint: "≈ 1000 字" },
  { minutes: 10, label: "10 分钟 · 长稿", hint: "≈ 2000 字" },
  { minutes: 20, label: "20 分钟 · 长稿", hint: "≈ 4000 字" },
  { minutes: 30, label: "30 分钟 · 长稿", hint: "≈ 6000 字" },
] as const;

export function CustomTopicActions({
  channelId,
  topicId,
  topicLabel,
  status,
  hasActiveBible,
}: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [pending, setPending] = useState<"analyze" | "script" | "delete" | null>(null);

  const analyze = trpc.poet.analyzeCustomTopic.useMutation({
    onSuccess: () => {
      toast.info(`已开始分析「${topicLabel.slice(0, 30)}」`);
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`启动失败：${err.message}`),
    onSettled: () => setPending(null),
  });

  const generate = trpc.poet.generateScriptFromCustomTopic.useMutation({
    onSuccess: () => {
      toast.info(`已开始为「${topicLabel.slice(0, 30)}」写稿`);
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`启动失败：${err.message}`),
    onSettled: () => setPending(null),
  });

  const remove = trpc.poet.deleteCustomTopic.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => toast.error(`删除失败：${err.message}`),
    onSettled: () => setPending(null),
  });

  const handleAnalyze = () => {
    if (!hasActiveBible) {
      toast.error("请先生成并激活一份频道圣经");
      return;
    }
    setPending("analyze");
    analyze.mutate({ channelId, topicId, language: "zh" });
  };

  const handleGenerate = (minutes: number) => {
    if (!hasActiveBible) {
      toast.error("请先生成并激活一份频道圣经");
      return;
    }
    setPending("script");
    generate.mutate({ channelId, topicId, durationMinutes: minutes, language: "zh" });
  };

  const handleDelete = () => {
    if (!confirm(`确定删除「${topicLabel.slice(0, 50)}」？`)) return;
    setPending("delete");
    remove.mutate({ topicId });
  };

  return (
    <div className="flex items-center gap-2">
      {status === "draft" ? (
        <Button
          size="sm"
          variant="outline"
          onClick={handleAnalyze}
          disabled={pending !== null}
        >
          {pending === "analyze" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Sparkles className="size-3" />
          )}
          分析
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline" disabled={pending !== null}>
                {pending === "script" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <PenLine className="size-3" />
                )}
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
                  onSelect={() => handleGenerate(d.minutes)}
                  disabled={pending !== null}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="text-sm">{d.label}</span>
                  <span className="text-xs text-muted-foreground">{d.hint}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={handleDelete}
        disabled={pending !== null}
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
