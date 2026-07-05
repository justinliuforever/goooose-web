"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export function UsagePanel() {
  const usage = trpc.access.myUsage.useQuery();
  const [code, setCode] = useState("");
  const redeem = trpc.access.redeem.useMutation({
    onSuccess: (res) => {
      toast.success(`兑换成功：本月时长 +${res.minutes} 分钟`);
      setCode("");
      void usage.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const m = usage.data?.minutes;
  const limit = m ? m.base + m.bonus : 0;
  const pct = m && limit > 0 ? Math.min((m.used / limit) * 100, 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>本月时长</CardTitle>
          <CardDescription>
            分析和生成共用一个时长池，每月 1 日（北京时间）重置
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {m ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-2xl">
                  {m.used}
                  <span className="text-sm text-muted-foreground"> / {m.base} 分钟</span>
                  {m.bonus > 0 ? (
                    <span className="ml-2 text-sm text-emerald-600">+{m.bonus} 奖励</span>
                  ) : null}
                </span>
                <span className="text-sm text-muted-foreground">
                  剩余 {Math.max(limit - m.used, 0)} 分钟
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  className={`h-2.5 rounded-full transition-all ${pct >= 100 ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                <li>分析视频：按实际时长计（不足 1 分钟按 1 分钟）</li>
                <li>分析图文笔记：每篇 5 分钟</li>
                <li>写稿：按目标时长计（如 10 分钟稿 = 10 分钟）</li>
                <li>频道圣经 5 分钟 / 选题分析 3 分钟 / 单视频 SOP 2 分钟</li>
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">加载中…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>兑换时长码</CardTitle>
          <CardDescription>兑换的时长加到本月额度，本月有效、月底随额度一起重置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SING-XXXX-XXXX"
              className="max-w-xs font-mono"
            />
            <Button
              disabled={redeem.isPending || code.trim().length < 6}
              onClick={() => redeem.mutate({ code })}
            >
              {redeem.isPending ? "兑换中…" : "兑换"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
