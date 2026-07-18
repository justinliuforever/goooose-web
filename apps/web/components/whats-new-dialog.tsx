"use client";

import { Sparkles } from "lucide-react";
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
const WHATS_NEW: Record<string, { title: string; items: string[] }> = {
  "0.8": {
    title: "抖音来了",
    items: [
      "粘贴抖音主页链接或分享口令，就能添加账号、导入对标",
      "视频、图文都能拆，选题和写稿也全支持",
      "爆款拆解新增评论区洞察，看观众为什么买账",
    ],
  },
};

const minorOf = (v: string | null | undefined) => v?.split(".").slice(0, 2).join(".") ?? null;

export function WhatsNewDialog({ lastSeenVersion }: { lastSeenVersion: string | null }) {
  const currentMinor = minorOf(APP_VERSION)!;
  const entry = WHATS_NEW[currentMinor];
  const [open, setOpen] = useState(!!entry && minorOf(lastSeenVersion) !== currentMinor);
  const markSeen = trpc.access.markVersionSeen.useMutation();

  if (!entry) return null;

  const acknowledge = () => {
    setOpen(false);
    markSeen.mutate();
  };

  return (
    // Esc/backdrop closes without marking seen — only 知道了 confirms, so an
    // accidental dismiss re-announces on the next visit.
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <div className="animate-in zoom-in-50 mx-auto flex size-11 items-center justify-center rounded-full bg-primary/10 duration-500">
            <Sparkles className="size-5 text-primary" />
          </div>
          <AlertDialogTitle className="text-center">
            Beta v{currentMinor} · {entry.title}
          </AlertDialogTitle>
        </AlertDialogHeader>
        <ul className="space-y-2 text-sm text-muted-foreground">
          {entry.items.map((item, i) => (
            <li
              key={item}
              className="animate-in fade-in slide-in-from-bottom-2 fill-mode-both flex gap-2 duration-500"
              style={{ animationDelay: `${200 + i * 120}ms` }}
            >
              <span className="mt-[3px] text-primary">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <AlertDialogFooter className="animate-in fade-in fill-mode-both duration-500" style={{ animationDelay: "600ms" }}>
          <Button className="w-full" onClick={acknowledge}>
            知道了
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
