// Canonical job keys for ETA history: client passes a jobKey, server maps it to deduplicated
// command strings — avoids prod command-name fragmentation (analyze-channel vs clerk-analyze-channel).

export type EtaJobKey = "clerk.analyze" | "muse.monitor" | "poet.script" | "poet.bible";

export const ETA_JOB_COMMANDS: Record<EtaJobKey, { agent: string; commands: string[] }> = {
  "clerk.analyze": { agent: "clerk", commands: ["analyze-channel", "clerk-analyze-channel"] },
  "muse.monitor": { agent: "muse", commands: ["monitor-competitors", "muse-monitor-competitors"] },
  "poet.script": { agent: "poet", commands: ["generate-script", "poet-generate-script"] },
  "poet.bible": { agent: "poet", commands: ["generate-bible", "poet-generate-bible"] },
};

// Cold-start linear fallback (seconds) when <5 historical samples; rough by design — percentile history takes over.
const COLD: Record<EtaJobKey, { base: number; per: number }> = {
  "clerk.analyze": { base: 180, per: 30 }, // per video (caption ~10s / ASR ~90s — wide band)
  "muse.monitor": { base: 120, per: 45 }, // per competitor
  "poet.script": { base: 120, per: 0 },
  "poet.bible": { base: 600, per: 12 }, // per video
};

// Null when count is unknown: caller shows step progress instead of a misleading base-only number.
export function coldStartRange(jobKey: EtaJobKey, count?: number): { lo: number; hi: number } | null {
  const c = COLD[jobKey];
  if (!c || !count || count <= 0) return null;
  const mid = c.base + c.per * count;
  return { lo: Math.round(mid * 0.7), hi: Math.round(mid * 1.6) };
}
