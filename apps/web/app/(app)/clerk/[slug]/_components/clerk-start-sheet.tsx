"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

type Source = "newest" | "popular" | "urls";
type Mode = "overwrite" | "incremental";

type ActiveRun = {
  runId: string;
  triggerRunId: string;
  publicAccessToken: string;
};

type Props = {
  channelId: string;
  channelName: string;
  disabled: boolean;
  onStarted: (run: ActiveRun) => void;
};

const SOURCE_OPTIONS: Array<{ value: Source; label: string; hint: string }> = [
  { value: "newest", label: "最新发布", hint: "频道最新发布的 N 个视频" },
  { value: "popular", label: "近期热门", hint: "近期发布里播放量最高的 N 个（看不到老爆款）" },
  { value: "urls", label: "指定链接", hint: "粘 YouTube 视频 URL，每行一个" },
];

const MODE_OPTIONS: Array<{ value: Mode; label: string; hint: string }> = [
  { value: "overwrite", label: "从头分析", hint: "覆盖该视频已有的分析结果" },
  { value: "incremental", label: "仅新视频", hint: "跳过已经分析过的视频" },
];

export function ClerkStartSheet({ channelId, channelName, disabled, onStarted }: Props) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source>("newest");
  const [mode, setMode] = useState<Mode>("overwrite");
  const [limit, setLimit] = useState("5");
  const [urls, setUrls] = useState("");
  const [error, setError] = useState<string | null>(null);

  const startMutation = trpc.clerk.startAnalysis.useMutation({
    onSuccess: (data) => {
      toast.info(`已开始分析「${channelName}」`);
      onStarted(data);
      setOpen(false);
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    setError(null);
    const limitNum = Number.parseInt(limit, 10);
    if (source !== "urls") {
      if (!Number.isFinite(limitNum) || limitNum < 1 || limitNum > 5) {
        setError("请输入 1-5 之间的数字");
        return;
      }
    }
    const videoIds =
      source === "urls"
        ? urls
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];
    if (source === "urls" && videoIds.length === 0) {
      setError("请粘贴至少 1 个视频 URL");
      return;
    }
    startMutation.mutate({
      channelId,
      limit: source === "urls" ? videoIds.length : limitNum,
      mode,
      source,
      videoIds,
      language: "zh",
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" disabled={disabled} />}>
        <Play data-icon="inline-start" />
        开始分析
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>分析视频</SheetTitle>
          <SheetDescription>选择视频范围和模式，然后开始分析</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel>视频来源</FieldLabel>
              <div className="flex gap-2">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSource(opt.value)}
                    className={`flex flex-1 flex-col items-start gap-0.5 rounded-md border p-3 text-left text-xs transition-colors ${
                      source === opt.value
                        ? "border-foreground bg-foreground/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            {source !== "urls" ? (
              <Field>
                <FieldLabel htmlFor="limit">数量（1-5）</FieldLabel>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={5}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  推荐 5 个（约 8-10 分钟出 SOP）
                </p>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="urls">视频链接（每行一个，最多 5 个）</FieldLabel>
                <Textarea
                  id="urls"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ&#10;https://youtu.be/abc123def45&#10;…"
                  rows={6}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  支持 youtube.com/watch · youtu.be · /shorts · /embed
                </p>
              </Field>
            )}

            <Field>
              <FieldLabel>分析模式</FieldLabel>
              <div className="flex gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={`flex flex-1 flex-col items-start gap-0.5 rounded-md border p-3 text-left text-xs transition-colors ${
                      mode === opt.value
                        ? "border-foreground bg-foreground/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-muted-foreground">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </Field>
          </FieldGroup>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <SheetFooter>
          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={startMutation.isPending}>
              {startMutation.isPending ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Play data-icon="inline-start" />
              )}
              {startMutation.isPending ? "启动中…" : "开始分析"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={startMutation.isPending}
            >
              取消
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
