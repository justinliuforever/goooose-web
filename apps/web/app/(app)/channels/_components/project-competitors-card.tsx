"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { isValidXhsProfileUrl, isValidYoutubeChannelUrl } from "@/server/trpc/schemas/channels";

function inferPlatform(url: string): "youtube" | "xhs" {
  return url.includes("xiaohongshu") ? "xhs" : "youtube";
}
function isValidFormat(platform: "youtube" | "xhs", url: string): boolean {
  return platform === "xhs" ? isValidXhsProfileUrl(url) : isValidYoutubeChannelUrl(url);
}

// project.id == channel.id during the expand phase, so the channel page passes channel.id.
export function ProjectCompetitorsCard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const bound = trpc.competitors.listForProject.useQuery({ projectId });
  const pool = trpc.competitors.list.useQuery();

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const boundIds = useMemo(() => new Set((bound.data ?? []).map((c) => c.id)), [bound.data]);

  const invalidate = () => {
    utils.competitors.listForProject.invalidate({ projectId });
    utils.competitors.list.invalidate();
    router.refresh();
  };
  const bindM = trpc.competitors.bind.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const unbindM = trpc.competitors.unbind.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const importM = trpc.competitors.import.useMutation({
    onSuccess: (data) => {
      invalidate();
      const n = data.results.filter((r) => r.id).length;
      toast.success(`已导入并绑定 ${n} 个对标`);
      setText("");
    },
    onError: (e) => toast.error(e.message),
  });

  const parsed = useMemo(
    () =>
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((url) => {
          const platform = inferPlatform(url);
          return { url, platform, ok: isValidFormat(platform, url) };
        }),
    [text],
  );
  const validCount = parsed.filter((p) => p.ok).length;

  const boundList = bound.data ?? [];
  const poolList = pool.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          对标账号 · {boundList.length}
        </CardTitle>
        <Sheet
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setText("");
          }}
        >
          <SheetTrigger render={<Button variant="outline" size="sm" />}>
            <Plus data-icon="inline-start" />
            管理对标
          </SheetTrigger>
          <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
            <SheetHeader>
              <SheetTitle>管理对标账号</SheetTitle>
              <SheetDescription>
                从对标库选择，或粘贴新链接导入并绑定。Muse 会巡视绑定的对标并生成选题。
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium">从对标库选择</p>
                {poolList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">对标库为空，可在下方粘贴链接导入。</p>
                ) : (
                  poolList.map((c) => {
                    const isBound = boundIds.has(c.id);
                    return (
                      <div key={c.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                        <Badge variant="outline" className="shrink-0">
                          {c.platform === "xhs" ? "小红书" : "YouTube"}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate">{c.name ?? c.url}</span>
                        <Button
                          size="sm"
                          variant={isBound ? "secondary" : "outline"}
                          disabled={bindM.isPending || unbindM.isPending}
                          onClick={() =>
                            isBound
                              ? unbindM.mutate({ projectId, competitorAccountId: c.id })
                              : bindM.mutate({ projectId, competitorAccountId: c.id })
                          }
                        >
                          {isBound ? (
                            <>
                              <Check data-icon="inline-start" />
                              已绑定
                            </>
                          ) : (
                            "绑定"
                          )}
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>

              <Field>
                <FieldLabel htmlFor="proj-import">导入新对标（每行一个链接）</FieldLabel>
                <Textarea
                  id="proj-import"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  placeholder={"https://www.youtube.com/@example\nhttps://www.xiaohongshu.com/user/profile/..."}
                />
                {parsed.length > 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    {validCount}/{parsed.length} 格式正确
                  </p>
                ) : null}
              </Field>
            </div>

            <SheetFooter className="mt-auto">
              <div className="flex items-center gap-3">
                <Button
                  disabled={validCount === 0 || importM.isPending}
                  onClick={() =>
                    importM.mutate({
                      projectId,
                      competitors: parsed.filter((p) => p.ok).map((p) => ({ platform: p.platform, url: p.url })),
                    })
                  }
                >
                  {importM.isPending ? "导入中…" : `导入并绑定 ${validCount} 个`}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  完成
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </CardHeader>
      <CardContent>
        {bound.isLoading ? (
          <p className="text-xs text-muted-foreground">加载中…</p>
        ) : boundList.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            未绑定对标 — 点「管理对标」添加。Muse 需要至少一个对标才能巡视。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {boundList.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
              >
                <Badge variant="outline" className="text-[9px]">
                  {c.platform === "xhs" ? "小红书" : "YouTube"}
                </Badge>
                <span className="max-w-[160px] truncate">{c.name ?? c.url}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => unbindM.mutate({ projectId, competitorAccountId: c.id })}
                  aria-label="解绑"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
