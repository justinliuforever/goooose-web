"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trash2, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { CompetitorAvatar } from "@/components/competitor-avatar";
import { RefreshCompetitorButton } from "@/components/refresh-competitor-button";
import { formatFollowerCount } from "@/lib/format-count";
import { inferPlatform, isValidPlatformUrl, PLATFORM_LABEL } from "@/lib/platform";
import { trpc } from "@/lib/trpc";

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  added: { label: "已添加", variant: "success" },
  duplicate: { label: "已存在", variant: "secondary" },
  unresolved: { label: "已添加 · 待解析", variant: "warning" },
  invalid: { label: "格式错误", variant: "destructive" },
};

export function CompetitorsManager() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const list = trpc.competitors.list.useQuery();

  const [importOpen, setImportOpen] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<
    Array<{ url: string; platform: "youtube" | "xhs" | "douyin"; status: string; id: string | null }> | null
  >(null);

  const parsed = useMemo(() => {
    return text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((url) => {
        const platform = inferPlatform(url);
        return { url, platform, ok: isValidPlatformUrl(platform, url) };
      });
  }, [text]);
  const validCount = parsed.filter((p) => p.ok).length;

  const importMutation = trpc.competitors.import.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      utils.competitors.list.invalidate();
      const added = data.results.filter((r) => r.status === "added" || r.status === "unresolved").length;
      if (added > 0) toast.success(`已添加 ${added} 个对标`);
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.competitors.remove.useMutation({
    onSuccess: (res) => {
      utils.competitors.list.invalidate();
      toast.success(res.unlinked > 0 ? `已删除，并从 ${res.unlinked} 个项目解绑` : "已删除");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  function handleImport() {
    const competitors = parsed.filter((p) => p.ok).map((p) => ({ platform: p.platform, url: p.url }));
    if (competitors.length === 0) {
      toast.error("没有格式正确的链接");
      return;
    }
    setResults(null);
    importMutation.mutate({ competitors });
  }

  const rows = list.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{rows.length} 个对标账号</p>
        <Sheet
          open={importOpen}
          onOpenChange={(o) => {
            setImportOpen(o);
            if (!o) {
              setText("");
              setResults(null);
            }
          }}
        >
          <SheetTrigger render={<Button size="sm" />}>
            <Upload data-icon="inline-start" />
            导入对标
          </SheetTrigger>
          <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
            <SheetHeader>
              <SheetTitle>导入对标账号</SheetTitle>
              <SheetDescription>每行一个主页链接，平台自动识别。</SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">格式示例</p>
                <p className="font-mono">YouTube · https://www.youtube.com/@mkbhd</p>
                <p className="font-mono">YouTube · https://www.youtube.com/channel/UCxxxx</p>
                <p className="font-mono">小红书 · https://www.xiaohongshu.com/user/profile/&#123;24位&#125;</p>
                <p className="font-mono">抖音 · https://www.douyin.com/user/... 或 v.douyin.com 短链</p>
              </div>

              <Field>
                <FieldLabel htmlFor="import-text">主页链接（每行一个）</FieldLabel>
                <Textarea
                  id="import-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={6}
                  placeholder={"https://www.youtube.com/@example\nhttps://www.xiaohongshu.com/user/profile/...\nhttps://www.douyin.com/user/..."}
                />
              </Field>

              {parsed.length > 0 && !results ? (
                <div className="flex flex-col gap-1 rounded-md border bg-card/50 p-2">
                  {parsed.map((p, i) => (
                    <div key={`${p.url}-${i}`} className="flex items-center gap-2 text-xs">
                      {p.ok ? (
                        <CheckCircle2 className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="size-3 shrink-0 text-destructive" />
                      )}
                      <Badge variant="outline" className="shrink-0">
                        {PLATFORM_LABEL[p.platform]}
                      </Badge>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {p.url.slice(0, 46)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}

              {results ? (
                <div className="flex flex-col gap-1 rounded-md border bg-card/50 p-2">
                  <p className="mb-1 text-xs font-medium">导入结果</p>
                  {results.map((r, i) => {
                    const meta = STATUS_LABEL[r.status] ?? STATUS_LABEL.invalid!;
                    return (
                      <div key={`${r.url}-${i}`} className="flex items-center gap-2 text-xs">
                        <Badge variant={meta.variant} className="shrink-0">
                          {meta.label}
                        </Badge>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {r.url.slice(0, 44)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <SheetFooter className="mt-auto">
              <div className="flex items-center gap-3">
                <Button onClick={handleImport} disabled={validCount === 0 || importMutation.isPending}>
                  {importMutation.isPending ? "导入中…" : `导入 ${validCount} 个`}
                </Button>
                <Button variant="ghost" onClick={() => setImportOpen(false)}>
                  关闭
                </Button>
              </div>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          还没有对标账号 — 点「导入对标」开始。
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>平台</TableHead>
              <TableHead className="text-right">粉丝/订阅</TableHead>
              <TableHead className="text-right">使用中</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[260px]">
                  <div className="flex items-center gap-2.5">
                    <CompetitorAvatar name={c.name} avatarUrl={c.avatarUrl} className="size-8" />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{c.name ?? "（未取名）"}</span>
                      <span className="truncate font-mono text-[10px] text-muted-foreground">{c.url}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{PLATFORM_LABEL[c.platform]}</Badge>
                  {c.needsResolution ? (
                    <Badge variant="warning" className="ml-1">
                      待解析
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold">{formatFollowerCount(c.subscriberCount)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{c.usedBy}</TableCell>
                <TableCell className="text-right">
                  <RefreshCompetitorButton competitorAccountId={c.id} iconOnly />
                  <AlertDialog>
                    <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
                      <Trash2 className="size-3.5" />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>删除对标「{c.name ?? c.url.slice(0, 30)}」？</AlertDialogTitle>
                        <AlertDialogDescription>
                          {c.usedBy > 0
                            ? `当前被 ${c.usedBy} 个项目使用，删除会一并解绑。`
                            : "该对标未被任何项目使用。"}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => removeMutation.mutate({ competitorAccountId: c.id })}
                        >
                          删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
