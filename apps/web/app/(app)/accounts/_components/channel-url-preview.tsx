"use client";

import { CheckCircle2, ExternalLink, Loader2, Search, XCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PLATFORM_LABEL } from "@/lib/platform";
import { trpc } from "@/lib/trpc";

type Props = {
  platform: "youtube" | "xhs" | "douyin";
  url: string;
};

type Preview =
  | {
      platform: "xhs";
      name: string;
      avatarUrl: string | null;
      redId: string;
      fansCount: number;
      interactionsCount: number;
      description: string;
      ipLocation: string;
    }
  | {
      platform: "douyin";
      name: string;
      url: string;
      avatarUrl: string | null;
      subscriberCount: number | null;
      awemeCount: number | null;
      uniqueId: string | null;
      ipLocation: string | null;
      signature: string | null;
    }
  | {
      platform: "youtube";
      name: string;
      channelId: string;
      subscriberCount: number | null;
      videoCount: number | null;
      description: string;
      source: "youtube-data" | "tikhub";
    };

function formatCount(n: number | null): string {
  if (n == null) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function ChannelUrlPreview({ platform, url }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mutation = trpc.channels.verifyUrl.useMutation({
    onSuccess: (data) => {
      setPreview(data as Preview);
      setErrorMsg(null);
    },
    onError: (err) => {
      setPreview(null);
      setErrorMsg(err.message);
    },
  });

  const trimmed = url.trim();
  const canVerify = trimmed.length > 0 && !mutation.isPending;

  const handleVerify = () => {
    if (!canVerify) return;
    setPreview(null);
    setErrorMsg(null);
    mutation.mutate({ platform, url: trimmed });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleVerify}
          disabled={!canVerify}
        >
          {mutation.isPending ? (
            <Loader2 data-icon="inline-start" className="size-3 animate-spin" />
          ) : (
            <Search data-icon="inline-start" className="size-3" />
          )}
          {mutation.isPending ? "验证中…" : "验证 / 预览"}
        </Button>
        {preview ? (
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3" /> 已验证
          </span>
        ) : null}
      </div>

      {errorMsg ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <XCircle className="size-3 shrink-0 translate-y-0.5" />
          <span>{errorMsg}</span>
        </div>
      ) : null}

      {preview ? <PreviewCard preview={preview} url={trimmed} /> : null}
    </div>
  );
}

function PreviewCard({ preview, url }: { preview: Preview; url: string }) {
  const description = preview.platform === "douyin" ? preview.signature : preview.description;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{preview.name}</span>
        <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-400">
          {PLATFORM_LABEL[preview.platform]}
        </span>
      </div>

      {preview.platform === "xhs" ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span>粉丝 {formatCount(preview.fansCount)}</span>
          <span>获赞与收藏 {formatCount(preview.interactionsCount)}</span>
          {preview.redId ? <span>小红书号 {preview.redId}</span> : null}
          {preview.ipLocation ? <span>IP {preview.ipLocation}</span> : null}
        </div>
      ) : preview.platform === "douyin" ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span>粉丝 {formatCount(preview.subscriberCount)}</span>
          <span>作品 {formatCount(preview.awemeCount)}</span>
          {preview.uniqueId ? <span>抖音号 {preview.uniqueId}</span> : null}
          {preview.ipLocation ? <span>IP {preview.ipLocation}</span> : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] text-muted-foreground">
          <span>订阅 {formatCount(preview.subscriberCount)}</span>
          <span>视频 {formatCount(preview.videoCount)}</span>
          <span>ID {preview.channelId}</span>
          <span className="opacity-60">数据源: {preview.source === "youtube-data" ? "YouTube 官方" : "TikHub 兜底"}</span>
        </div>
      )}

      {description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{description}</p>
      ) : null}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-fit items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
      >
        打开原链接 <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
