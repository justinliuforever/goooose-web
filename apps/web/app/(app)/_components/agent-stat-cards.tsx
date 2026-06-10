"use client";

import { motion } from "framer-motion";
import {
  ArrowRightIcon,
  BarChart3,
  Lightbulb,
  PenLine,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import type { AgentStats, RunningByAgent } from "@/lib/dashboard-data";

type AgentName = "clerk" | "muse" | "poet";

type CardSpec = {
  agent: AgentName;
  code: string;
  title: string;
  subtitle: string;
  countLabel: string;
  href: string;
  Icon: LucideIcon;
  dotClass: string;
};

const CARDS: CardSpec[] = [
  {
    agent: "clerk",
    code: "CLERK-091",
    title: "分析师",
    subtitle: "拆解频道结构与套路",
    countLabel: "视频已分析",
    href: "/clerk",
    Icon: BarChart3,
    dotClass: "bg-clerk",
  },
  {
    agent: "muse",
    code: "MUSE-442",
    title: "选题官",
    subtitle: "巡视对标，提取爆款机制",
    countLabel: "选题已生成",
    href: "/accounts",
    Icon: Lightbulb,
    dotClass: "bg-muse",
  },
  {
    agent: "poet",
    code: "POET-118",
    title: "写手",
    subtitle: "圣经驱动的稿件生成",
    countLabel: "脚本已写",
    href: "/accounts",
    Icon: PenLine,
    dotClass: "bg-poet",
  },
];

type Props = {
  stats: AgentStats;
  runningByAgent: RunningByAgent;
  hrefs: Record<AgentName, string>;
};

export function AgentStatCards({ stats, runningByAgent, hrefs }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {CARDS.map((card, index) => {
        const s = stats[card.agent];
        const isRunning = runningByAgent[card.agent];
        return (
          <motion.div
            key={card.agent}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: index * 0.08,
              type: "spring",
              stiffness: 400,
              damping: 25,
            }}
          >
            <Link
              href={hrefs[card.agent]}
              className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-lg border bg-card p-5 transition-shadow hover:shadow-md"
            >
              {isRunning ? (
                <span className="absolute right-3 top-3 flex size-2">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full ${card.dotClass} opacity-70`}
                  />
                  <span className={`relative inline-flex size-2 rounded-full ${card.dotClass}`} />
                </span>
              ) : null}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${card.dotClass}`} />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {card.code}
                  </span>
                </div>
                <card.Icon className="size-5 text-muted-foreground" />
              </div>

              <div>
                <h3 className="text-base font-semibold tracking-tight">{card.title}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{card.subtitle}</p>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-3xl tabular-nums">{s.total}</span>
                {s.deltaSevenDay > 0 ? (
                  <span className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <TrendingUpIcon className="size-3" />+{s.deltaSevenDay} (7d)
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">(7d 无变化)</span>
                )}
              </div>
              <div className="-mt-2 text-xs text-muted-foreground">{card.countLabel}</div>

              <div className="mt-auto flex items-center gap-1 text-xs font-medium text-foreground/80 transition-colors group-hover:text-foreground">
                进入 {card.title}
                <ArrowRightIcon className="size-3 transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
