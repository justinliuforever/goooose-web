import Link from "next/link";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Step = {
  title: string;
  description: string;
  cta: string;
  href: string;
  // 1-based milestone position on the golden path; null = off-path (backlog / cruising).
  index: number | null;
};

const TOTAL_STEPS = 6;

type NavLinks = { clerk: string; muse: string; poet: string; projectHub: string };

type Props = {
  channelCount: number;
  clerkTotal: number;
  museTotal: number;
  poetTotal: number;
  pendingMuseIdeas: number;
  competitorCount: number;
  links: NavLinks;
};

function pickStep({
  channelCount,
  clerkTotal,
  museTotal,
  poetTotal,
  pendingMuseIdeas,
  competitorCount,
  links,
}: Props): Step {
  if (channelCount === 0) {
    return {
      title: "先建一个自己的频道",
      description: "Singularity 围绕你自己的频道运转 — 配置好定位和对标后，三个 agent 才能工作。",
      cta: "创建账号",
      href: "/accounts/new",
      index: 1,
    };
  }
  if (competitorCount === 0) {
    return {
      title: "给项目加几个对标账号",
      description: "Muse 靠对标账号巡视爆款、提取选题；先在项目里绑定几个同赛道账号，后面才有素材可挖。",
      cta: "去加对标",
      href: links.projectHub,
      index: 2,
    };
  }
  if (clerkTotal === 0) {
    return {
      title: "让 Clerk 拆解频道",
      description: `你有 ${channelCount} 个频道还没有 SOP — Clerk 会拆解频道的爆款机制，Muse 和 Poet 后续都靠它输出的套路。`,
      cta: "去 Clerk",
      href: links.clerk,
      index: 3,
    };
  }
  if (museTotal === 0) {
    return {
      title: "让 Muse 巡视一遍对标",
      description: "Muse 会抓取最新对标视频、提取爆款触发因素，并按你的频道定位生成可写的选题。",
      cta: "去 Muse",
      href: links.muse,
      index: 4,
    };
  }
  if (pendingMuseIdeas > 0 && poetTotal === 0) {
    return {
      title: "审一下选题再开始写稿",
      description: `你有 ${pendingMuseIdeas} 个未审选题。挑出值得写的，Poet 就能按频道圣经把它写出来。`,
      cta: "去审选题",
      href: links.muse,
      index: 5,
    };
  }
  if (poetTotal === 0) {
    return {
      title: "用 Poet 写第一篇稿",
      description: "选一个你审过的选题，Poet 会按频道圣经 + 爆款套路写出可发布的脚本，60 秒出稿。",
      cta: "去 Poet",
      href: links.poet,
      index: 6,
    };
  }
  if (pendingMuseIdeas >= 5) {
    return {
      title: `你有 ${pendingMuseIdeas} 个未审选题`,
      description: "处理一下选题积压，决定哪些值得写、哪些归档。审完就能直接派给 Poet 写稿。",
      cta: "去审选题",
      href: links.muse,
      index: null,
    };
  }
  return {
    title: "继续推进",
    description: `已经全员上线：${clerkTotal} 个分析、${museTotal} 个选题、${poetTotal} 个脚本。下一步可以扩对标账号或回到任一 agent 继续。`,
    cta: "去 Muse",
    href: links.muse,
    index: null,
  };
}

function segmentClass(i: number, index: number | null): string {
  if (index === null) return "bg-poet";
  if (i < index - 1) return "bg-poet";
  if (i === index - 1) return "bg-poet/50";
  return "bg-border";
}

export function NextStepCard(props: Props) {
  const step = pickStep(props);
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg border bg-card p-5 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-poet" />
      <div className="flex items-center gap-2">
        <SparklesIcon className="size-4 text-poet" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Next step
        </span>
        {step.index !== null ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            第 {step.index} / {TOTAL_STEPS} 步
          </span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold leading-tight">{step.title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{step.description}</p>
      <div className="flex max-w-sm gap-1">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <span key={i} className={`h-1 flex-1 rounded-full ${segmentClass(i, step.index)}`} />
        ))}
      </div>
      <Button render={<Link href={step.href} />} size="sm" className="self-start">
        {step.cta}
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}
