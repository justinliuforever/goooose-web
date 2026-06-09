"use client";

import { Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";

type Language = "zh" | "en";

type Props = {
  channelId: string;
  channelName: string;
  competitorCount: number;
  disabled: boolean;
};

const VIDEOS_PER_COMPETITOR = [5, 10, 20, 50] as const;
const IDEAS_PER_VIDEO = [3, 5, 10] as const;

const LANGUAGE_OPTIONS: Array<{ value: Language; label: string; hint: string }> = [
  { value: "zh", label: "中文选题", hint: "适合中文目标频道" },
  { value: "en", label: "English ideas", hint: "适合英文目标频道" },
];

export function MuseStartSheet({ channelId, channelName, competitorCount, disabled }: Props) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [maxVideos, setMaxVideos] = useState<(typeof VIDEOS_PER_COMPETITOR)[number]>(10);
  const [numIdeas, setNumIdeas] = useState<(typeof IDEAS_PER_VIDEO)[number]>(5);
  const [language, setLanguage] = useState<Language>("zh");
  const [error, setError] = useState<string | null>(null);

  const startMutation = trpc.muse.startMonitor.useMutation({
    onSuccess: () => {
      toast.info(`已开始巡视「${channelName}」的对标频道`);
      setOpen(false);
      // Re-fetch the server `activeRun` so the progress panel shows without a manual refresh.
      utils.invalidate();
      router.refresh();
    },
    onError: (err) => setError(err.message),
  });

  const handleSubmit = () => {
    setError(null);
    startMutation.mutate({
      channelId,
      maxVideosPerCompetitor: maxVideos,
      numIdeasPerVideo: numIdeas,
      language,
    });
  };

  const totalIdeas = competitorCount * maxVideos * numIdeas;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" disabled={disabled} />}>
        <Play data-icon="inline-start" />
        开始巡视
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>巡视对标频道</SheetTitle>
          <SheetDescription>
            扫描 {competitorCount} 个对标频道的最新视频，提取爆款机制并为本频道生成选题
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel>每个对标频道拉取视频数</FieldLabel>
              <div className="flex gap-2">
                {VIDEOS_PER_COMPETITOR.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxVideos(n)}
                    className={`flex-1 rounded-md border p-2 font-mono text-xs transition-colors ${
                      maxVideos === n
                        ? "border-foreground bg-foreground/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                推荐 10 个，每条视频 30-90s 处理时间
              </p>
            </Field>

            <Field>
              <FieldLabel>每个相关视频生成选题数</FieldLabel>
              <div className="flex gap-2">
                {IDEAS_PER_VIDEO.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumIdeas(n)}
                    className={`flex-1 rounded-md border p-2 font-mono text-xs transition-colors ${
                      numIdeas === n
                        ? "border-foreground bg-foreground/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                每个被判定「有借鉴价值」的视频会生成这么多选题
              </p>
            </Field>

            <Field>
              <FieldLabel>选题语言</FieldLabel>
              <div className="flex gap-2">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLanguage(opt.value)}
                    className={`flex flex-1 flex-col items-start gap-0.5 rounded-md border p-3 text-left text-xs transition-colors ${
                      language === opt.value
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

            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <span className="font-medium text-foreground">预估上限：</span>
              <span className="font-mono">
                {competitorCount} × {maxVideos} × {numIdeas} = 最多 {totalIdeas.toLocaleString()} 选题
              </span>
              <p className="mt-1 text-muted-foreground">
                实际产出取决于相关性筛选 — 不是所有视频都有可借鉴的爆款机制。
              </p>
            </div>
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
              {startMutation.isPending ? "启动中…" : "开始巡视"}
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
