import Link from "next/link";
import { ArrowRightIcon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

const STEPS = [
  {
    dot: "bg-foreground/50",
    title: "建自己的频道",
    subtitle: "你的内容资产，沉淀定位与频道圣经",
  },
  {
    dot: "bg-clerk",
    title: "Clerk 拆解频道",
    subtitle: "拆解结构与套路，生成脚本 SOP",
  },
  {
    dot: "bg-muse",
    title: "Muse 出选题",
    subtitle: "巡视对标，提取爆款机制",
  },
  {
    dot: "bg-poet",
    title: "Poet 写稿",
    subtitle: "圣经驱动的稿件生成",
  },
];

export function OnboardingOverview() {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="contents">
            {i > 0 ? (
              <ArrowRightIcon className="hidden size-4 shrink-0 text-muted-foreground/50 sm:block" />
            ) : null}
            <div className="flex w-full flex-col gap-1 rounded-lg border bg-card p-4 sm:w-44">
              <div className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-full ${step.dot}`} />
                <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
                <h3 className="text-sm font-medium">{step.title}</h3>
              </div>
              <p className="text-xs leading-snug text-muted-foreground">{step.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
      <Button render={<Link href="/accounts/new" />} size="lg">
        <Plus data-icon="inline-start" />
        创建第一个账号
      </Button>
    </div>
  );
}
