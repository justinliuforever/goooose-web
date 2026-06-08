"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Chapter = { start_time: number; end_time: number; title: string };
type SponsorChapter = { start_time: number; end_time: number; category: string };

type Props = {
  durationSec: number;
  chapters?: Chapter[] | null;
  sponsorChapters?: SponsorChapter[] | null;
};

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CATEGORY_LABEL: Record<string, string> = {
  sponsor: "广告",
  selfpromo: "自宣",
  intro: "片头",
  outro: "片尾",
  preview: "预告",
  filler: "废话",
  music_offtopic: "无关音乐",
  interaction: "互动求关注",
  hook: "钩子",
};

export function VideoTimelineBar({ durationSec, chapters, sponsorChapters }: Props) {
  if (!durationSec || durationSec <= 0) return null;
  const safeChapters = chapters ?? [];
  const safeSponsor = sponsorChapters ?? [];
  if (safeChapters.length === 0 && safeSponsor.length === 0) return null;

  const chapterColors = ["bg-clerk/70", "bg-muse/70", "bg-poet/70", "bg-foreground/30"];

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-2">
        {safeChapters.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>章节</span>
              <span className="font-mono">{safeChapters.length}</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              {safeChapters.map((c, i) => {
                const left = (c.start_time / durationSec) * 100;
                const width = ((c.end_time - c.start_time) / durationSec) * 100;
                return (
                  <Tooltip key={`${c.start_time}-${i}`}>
                    <TooltipTrigger
                      render={
                        <div
                          className={`absolute top-0 h-full ${chapterColors[i % chapterColors.length]} cursor-pointer transition-opacity hover:opacity-80`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                        />
                      }
                    />
                    <TooltipContent>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] text-background/70">
                          {fmt(c.start_time)} – {fmt(c.end_time)}
                        </span>
                        <span className="font-medium">{c.title}</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ) : null}

        {safeSponsor.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>SponsorBlock</span>
              <span className="font-mono">{safeSponsor.length}</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              {safeSponsor.map((c, i) => {
                const left = (c.start_time / durationSec) * 100;
                const width = ((c.end_time - c.start_time) / durationSec) * 100;
                const isAd = c.category === "sponsor" || c.category === "selfpromo";
                return (
                  <Tooltip key={`s-${c.start_time}-${i}`}>
                    <TooltipTrigger
                      render={
                        <div
                          className={`absolute top-0 h-full cursor-pointer transition-opacity hover:opacity-80 ${isAd ? "bg-destructive/80" : "bg-amber-500/70"}`}
                          style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                        />
                      }
                    />
                    <TooltipContent>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[10px] text-background/70">
                          {fmt(c.start_time)} – {fmt(c.end_time)}
                        </span>
                        <span className="font-medium">
                          {CATEGORY_LABEL[c.category] ?? c.category}
                        </span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span>0:00</span>
          <span>{fmt(durationSec)}</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
