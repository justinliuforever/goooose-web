// Poet length thresholds + drift telemetry shapes.

export const ZH_CHARS_PER_MINUTE = 200;
export const EN_WORDS_PER_MINUTE = 150;

export const LONG_FORM_THRESHOLD = {
  zh: 2000,
  en: 1500,
} as const;

export const DEFAULT_TARGET_WORD_COUNT = {
  zh: 1000, // ~5 min default, stays in short-form path
  en: 750,
} as const;

export function rateForLanguage(language: "zh" | "en"): number {
  return language === "zh" ? ZH_CHARS_PER_MINUTE : EN_WORDS_PER_MINUTE;
}

export function computeTargetWordCount(
  durationMinutes: number | null | undefined,
  language: "zh" | "en",
): number {
  if (!durationMinutes || durationMinutes <= 0) {
    return DEFAULT_TARGET_WORD_COUNT[language];
  }
  return Math.round(durationMinutes * rateForLanguage(language));
}

export function isLongForm(targetWordCount: number, language: "zh" | "en"): boolean {
  return targetWordCount >= LONG_FORM_THRESHOLD[language];
}

export type DriftReason = "no_overlap" | "ai_markers" | "topic_substitution";

export type DriftWarning = {
  reason: DriftReason;
  claimedTopic: string;
  sampleUserTerms: string[];
  humanMessage: string;
  markerHits?: number;
};
