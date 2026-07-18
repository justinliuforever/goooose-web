import { Send, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_VERSION_LABEL } from "@/lib/version";

export const metadata: Metadata = {
  title: "搬砖小鹅 Goooose",
  // Unlisted page — reachable only by direct URL, keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function SecretPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="font-brand text-xl leading-none">
          搬砖小鹅 <span className="font-display italic">Goooose</span>
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="font-brand text-2xl">来 Telegram 聊聊</h1>
            <p className="text-sm text-muted-foreground">
              内测期间，产品问题、想法、反馈，直接找我们。
            </p>
          </div>
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Button
                render={<a href="https://t.me/unbound_lab_assistant_bot" target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                size="lg"
              >
                <Send data-icon="inline-start" />
                和 Bot 对话
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground">@unbound_lab_assistant_bot</span>
            </div>
            <div className="flex flex-col gap-1">
              <Button
                render={<a href="https://t.me/jujuzmz" target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                variant="outline"
                size="lg"
              >
                <UserRound data-icon="inline-start" />
                加创始人好友
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground">@jujuzmz</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/70">此页面没有站内入口，请自行收藏。</p>
        </div>
      </main>
      <footer className="flex items-center justify-center gap-3 px-6 pb-8 text-xs text-muted-foreground">
        <span>© 2026 搬砖小鹅 Goooose</span>
        <span className="font-mono text-[10px] tracking-widest uppercase">{APP_VERSION_LABEL}</span>
      </footer>
    </div>
  );
}
