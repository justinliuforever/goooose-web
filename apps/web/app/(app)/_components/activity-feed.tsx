"use client";

import { motion } from "framer-motion";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cnYmd } from "@/lib/cn-time";
import type { ActivityRow } from "@/lib/dashboard-data";

type Props = {
  activity: ActivityRow[];
};

const AGENT_LABEL: Record<ActivityRow["agent"], string> = {
  clerk: "CLERK",
  muse: "MUSE",
  poet: "POET",
};

const AGENT_PILL: Record<ActivityRow["agent"], string> = {
  clerk: "bg-clerk/10 text-clerk",
  muse: "bg-muse/10 text-muse",
  poet: "bg-poet/10 text-poet",
};

const AGENT_ACCENT: Record<ActivityRow["agent"], string> = {
  clerk: "bg-clerk",
  muse: "bg-muse",
  poet: "bg-poet",
};

const STATUS_DOT: Record<ActivityRow["status"], string> = {
  done: "bg-emerald-500",
  running: "bg-blue-500",
  pending: "bg-muted-foreground/40",
  failed: "bg-destructive",
};

function describeCommand(command: string): string {
  switch (command) {
    case "clerk-analyze-channel":
      return "分析了频道";
    case "muse-monitor-competitors":
      return "巡视了对标账号";
    case "poet-generate-bible":
      return "生成了频道圣经";
    case "poet-generate-script":
      return "写完了一篇脚本";
    case "poet-analyze-custom-topic":
      return "分析了自定义选题";
    default:
      return command;
  }
}

// Default project slug == account slug (D3 spine); muse/poet live under the nested
// project route, so linking there directly avoids the 308 hop off the bare route.
function agentDeepLink(agent: ActivityRow["agent"], channelSlug: string): string {
  const s = encodeURIComponent(channelSlug);
  if (agent === "clerk") return `/clerk/${s}`;
  return `/accounts/${s}/projects/${s}/${agent}`;
}

function relativeTime(d: Date): string {
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} 小时前`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} 天前`;
}

type Bucket = "recent" | "today" | "yesterday" | "earlier";

function bucketOf(d: Date): Bucket {
  const now = new Date();
  const ageMin = (now.getTime() - d.getTime()) / 60000;
  if (ageMin < 30) return "recent";
  const today = cnYmd(now);
  const dDay = cnYmd(d);
  if (dDay === today) return "today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dDay === cnYmd(yesterday)) return "yesterday";
  return "earlier";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  recent: "30 分钟内",
  today: "今天",
  yesterday: "昨天",
  earlier: "更早",
};

const BUCKET_ORDER: Bucket[] = ["recent", "today", "yesterday", "earlier"];

export function ActivityFeed({ activity }: Props) {
  const grouped = new Map<Bucket, ActivityRow[]>();
  for (const row of activity) {
    const b = bucketOf(new Date(row.startedAt));
    const list = grouped.get(b) ?? [];
    list.push(row);
    grouped.set(b, list);
  }

  return (
    <TooltipProvider delay={150}>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium text-sm">最近动态</h2>
          <p className="mt-0.5 text-muted-foreground text-xs">所有频道、所有 agent 的近期事件</p>
        </div>
        {activity.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            还没有任何活动 — 去任一频道启动 Clerk / Muse / Poet 开始
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            {BUCKET_ORDER.map((bucket) => {
              const rows = grouped.get(bucket);
              if (!rows || rows.length === 0) return null;
              return (
                <div key={bucket}>
                  <div className="sticky top-0 z-10 border-b bg-muted/50 px-4 py-1.5 backdrop-blur-sm">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {BUCKET_LABEL[bucket]}
                    </span>
                  </div>
                  {rows.map((row, i) => (
                    <ActivityItem key={row.id} row={row} index={i} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ActivityItem({ row, index }: { row: ActivityRow; index: number }) {
  const time = relativeTime(new Date(row.startedAt));
  const isRunning = row.status === "running" || row.status === "pending";
  const isFailed = row.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        delay: Math.min(index * 0.03, 0.18),
        type: "spring",
        stiffness: 400,
        damping: 28,
      }}
      className="group relative flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 hover:bg-muted/40"
    >
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 w-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${AGENT_ACCENT[row.agent]}`}
      />
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-medium ${AGENT_PILL[row.agent]}`}
      >
        {AGENT_LABEL[row.agent].slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{AGENT_LABEL[row.agent]}</span>
          <span className="text-muted-foreground"> {describeCommand(row.command)} · </span>
          <Link
            href={agentDeepLink(row.agent, row.channelSlug)}
            className="font-medium hover:underline"
          >
            {row.channelName}
          </Link>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isRunning ? <Loader2 className="size-3 animate-spin text-blue-500" /> : null}
        {isFailed && row.errorMessage ? (
          <Tooltip>
            <TooltipTrigger
              render={<AlertCircle className="size-3 cursor-help text-destructive" />}
            />
            <TooltipContent side="left" className="max-w-xs">
              <p className="text-xs">{row.errorMessage.slice(0, 240)}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {!isRunning && !isFailed ? (
          <span className={`size-1.5 rounded-full ${STATUS_DOT[row.status]}`} />
        ) : null}
        <span className="font-mono text-[10px] text-muted-foreground">{time}</span>
      </div>
    </motion.div>
  );
}
