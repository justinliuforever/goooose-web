"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { APP_VERSION } from "@/lib/version";

// Curated per-minor-version highlights (not the full release notes). No entry = no dialog.
const WHATS_NEW: Record<string, { title: string; items: string[]; cta?: { label: string; href: string } }> = {
  "0.8": {
    title: "抖音来了",
    items: [
      "第三个平台正式接入：主页链接、v.douyin.com 分享短链、整段分享口令都能直接粘贴",
      "拆解 / 选题 / 写稿全链路可用，视频与图文（图集）作品都支持",
      "爆款 SOP 附评论区共鸣分析（top 100 条评论）",
      "抖音不公开播放数——列表按加权互动分排序，明确标注「互动分」，绝不冒充播放量",
    ],
    cta: { label: "去导入一个抖音对标", href: "/competitors" },
  },
};

const minorOf = (v: string | null | undefined) => v?.split(".").slice(0, 2).join(".") ?? null;

export function WhatsNewDialog({ lastSeenVersion }: { lastSeenVersion: string | null }) {
  const currentMinor = minorOf(APP_VERSION)!;
  const entry = WHATS_NEW[currentMinor];
  const [open, setOpen] = useState(!!entry && minorOf(lastSeenVersion) !== currentMinor);
  const markSeen = trpc.access.markVersionSeen.useMutation();

  if (!entry) return null;

  const dismiss = () => {
    setOpen(false);
    markSeen.mutate();
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Beta v{currentMinor} · {entry.title}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1.5 pl-4 text-left text-sm text-muted-foreground">
          {entry.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={dismiss}>
            知道了
          </Button>
          {entry.cta ? (
            <Button render={<Link href={entry.cta.href} />} nativeButton={false} onClick={dismiss}>
              {entry.cta.label}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
