"use client";

import { useState } from "react";

import { clampEta, formatEtaRange } from "@/lib/eta";
import { coldStartRange, type EtaJobKey } from "@/lib/eta-jobs";
import { trpc } from "@/lib/trpc";

// Honest ETA for a running job (§ PROG P1/P2/P3). The user chose "range + step" over a single
// countdown, so once a live estimate arrives we show a *tightening band* around it (not a bare
// countdown). Before live data: historical p50–p90 range. Stays silent when the band would be
// too wide to be useful — false precision reads as broken.
//
// P3 handoff rules (prevents the number visibly jumping when the live estimate takes over):
// - live is ignored until ~10% of the work is done (when `fraction` is provided);
// - between 10% and 40%, display blends 70% historical-remaining proxy / 30% live;
// - the displayed value may never rise above the historical p90 (clampEta ceiling).
export function EtaHint({
  jobKey,
  count,
  liveSec,
  fraction,
}: {
  jobKey: EtaJobKey;
  count?: number;
  liveSec?: number;
  fraction?: number;
}) {
  const { data } = trpc.pipeline.etaHints.useQuery({ jobKey }, { staleTime: 300_000 });
  const t1 = data && data.n >= 5 && data.p90Sec > 0 ? { p50: data.p50Sec, p90: data.p90Sec } : null;

  // Derived state with memory ("adjusting state during render" pattern): the displayed live
  // value tracks the incoming estimate through clampEta so it never visibly jumps upward.
  const [display, setDisplay] = useState<number | null>(null);
  const liveGated = fraction == null || fraction >= 0.1;
  if (liveSec != null && liveSec > 0 && liveGated) {
    let v = liveSec;
    if (t1 && fraction != null && fraction < 0.4) {
      v = Math.round(0.7 * t1.p50 * (1 - fraction) + 0.3 * liveSec);
    }
    const next = clampEta(display, v, t1 ? t1.p90 : Infinity);
    if (next !== display) setDisplay(next);
  }

  if (display != null && display > 0) {
    return (
      <span className="font-mono text-[10px] text-muted-foreground">
        预计 {formatEtaRange(display * 0.8, display * 1.35)}
      </span>
    );
  }

  // Cold-start: historical percentile range, else input-based band.
  const range = t1 ? { lo: t1.p50, hi: t1.p90 } : coldStartRange(jobKey, count);

  if (!range || range.hi <= 0) return null;
  if (range.lo > 0 && range.hi > range.lo * 4) return null; // variance too high → rely on step

  return (
    <span className="font-mono text-[10px] text-muted-foreground">预计 {formatEtaRange(range.lo, range.hi)}</span>
  );
}
