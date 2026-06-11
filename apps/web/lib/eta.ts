// Shared ETA display helpers. The user chose "honest range + step" over a single countdown;
// clampEta keeps a live single estimate from visibly jumping.

// Round to a granularity that matches the magnitude — false precision reads as broken.
function roundSec(s: number): number {
  if (s < 300) return Math.round(s / 30) * 30; // <5min → 30s
  if (s < 1800) return Math.round(s / 60) * 60; // <30min → 1min
  return Math.round(s / 300) * 300; // else → 5min
}

function unitParts(sec: number): { value: number; unit: "秒" | "分钟" } {
  const s = Math.max(0, roundSec(sec));
  if (s < 60) return { value: Math.max(s, 15), unit: "秒" };
  return { value: Math.round(s / 60), unit: "分钟" };
}

export function formatDurationCN(sec: number): string {
  const { value, unit } = unitParts(sec);
  return `约 ${value} ${unit}`;
}

// "约 3–9 分钟" / "约 30–45 秒" / mixed units fall back to two full labels.
export function formatEtaRange(loSec: number, hiSec: number): string {
  const lo = unitParts(Math.min(loSec, hiSec));
  const hi = unitParts(Math.max(loSec, hiSec));
  if (lo.value === hi.value && lo.unit === hi.unit) return `约 ${lo.value} ${lo.unit}`;
  if (lo.unit === hi.unit) return `约 ${lo.value}–${hi.value} ${lo.unit}`;
  return `约 ${lo.value} ${lo.unit} – ${hi.value} ${hi.unit}`;
}

// "第 3/8 个视频" — the honest fallback for high-variance jobs (Poet long-form) where a
// number would be misleading.
export function formatStep(current: number, total: number, noun: string): string {
  return `第 ${Math.min(current + 1, total)}/${total} ${noun}`;
}

// Keep the displayed live ETA from visibly jumping up. Rises are allowed only up to a
// historical ceiling (T1 p90) — the legitimate "concurrency tail" case — otherwise it decays
// toward the candidate. Returns the seconds to display.
export function clampEta(prev: number | null, candidate: number, ceilingSec = Infinity): number {
  const c = Math.max(0, Math.min(candidate, ceilingSec));
  if (prev == null) return c;
  if (c > prev) return Math.min(c, ceilingSec); // rise only toward the ceiling
  return c; // decay freely
}
