"use client";

import { Layers, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { ChannelSeries } from "@singularity/db";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

type Props = {
  channelId: string;
  initialSeries: ChannelSeries[];
};

export function ClerkSeriesPanel({ channelId, initialSeries }: Props) {
  const listQuery = trpc.clerk.listSeries.useQuery(
    { channelId },
    { initialData: initialSeries, refetchOnWindowFocus: false },
  );
  const series = (listQuery.data ?? initialSeries) as ChannelSeries[];

  const utils = trpc.useUtils();
  const detect = trpc.clerk.detectSeries.useMutation({
    onSuccess: () => {
      toast.info("已开始扫描频道系列（约 1-2 分钟），完成后会自动刷新。");
      setTimeout(() => utils.clerk.listSeries.invalidate({ channelId }), 90_000);
    },
    onError: (err) => toast.error(err.message),
  });

  const hasSeries = series.length > 0;

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">频道系列</h2>
          {hasSeries ? (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {series.length} 个
            </Badge>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => detect.mutate({ channelId, videoCount: 100, language: "zh" })}
          disabled={detect.isPending}
        >
          {detect.isPending ? (
            <Loader2 data-icon="inline-start" className="animate-spin" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          {hasSeries ? "重新归类" : "扫描归类（拉 100 条）"}
        </Button>
      </div>

      {!hasSeries ? (
        <p className="text-xs text-muted-foreground">
          频道系列归类会拉取近 100 个视频，按主题（如教育/旅行/种草）聚类，让你能挑系列做针对性 SOP 分析。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {series.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5 rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {s.videoCount} 个
                </Badge>
              </div>
              {s.description ? (
                <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
              ) : null}
              {s.sampleVideos.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground">
                  {s.sampleVideos.slice(0, 3).map((v) => (
                    <li key={v.video_id} className="truncate">
                      · {v.title}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
