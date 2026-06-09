"use client";

import { formatEtaRange } from "@/lib/eta";
import { coldStartRange, type EtaJobKey } from "@/lib/eta-jobs";
import { trpc } from "@/lib/trpc";

// Honest ETA range for a running job (§ PROG P1). Uses historical p50/p90 once >=5 samples
// exist, else a cold-start band from the input count. Stays SILENT (lets the step bar speak)
// when the band is too wide to be useful — false precision reads as broken.
export function EtaHint({ jobKey, count }: { jobKey: EtaJobKey; count?: number }) {
  const { data } = trpc.pipeline.etaHints.useQuery({ jobKey }, { staleTime: 300_000 });

  let range: { lo: number; hi: number } | null = null;
  if (data && data.n >= 5 && data.p90Sec > 0) {
    range = { lo: data.p50Sec, hi: data.p90Sec };
  } else {
    range = coldStartRange(jobKey, count);
  }

  if (!range || range.hi <= 0) return null;
  if (range.lo > 0 && range.hi > range.lo * 4) return null; // variance too high → rely on step

  return (
    <span className="font-mono text-[10px] text-muted-foreground">预计 {formatEtaRange(range.lo, range.hi)}</span>
  );
}
