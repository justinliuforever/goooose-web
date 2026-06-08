"use client";

import { AlertTriangle, X } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  driftEventId: string;
  humanMessage: string;
};

const DISMISS_KEY = "poet:drift:dismissed";

// Localstorage-backed dismiss so a closed banner stays closed across navigations
// and refreshes. Keyed per drift event id so a fresh drift event re-surfaces.
export function DriftBanner({ driftEventId, humanMessage }: Props) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      // Effect, not lazy init — reading localStorage at init breaks SSR hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (ids.includes(driftEventId)) setDismissed(true);
    } catch {
      /* ignore */
    }
  }, [driftEventId]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      const ids = raw ? (JSON.parse(raw) as string[]) : [];
      if (!ids.includes(driftEventId)) {
        const next = [...ids.slice(-20), driftEventId];
        window.localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
      }
    } catch {
      /* ignore */
    }
  };

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-1 text-sm">
        <strong className="font-medium">上次生成的圣经被标记为偏题</strong>
        <span>{humanMessage}</span>
        <span className="text-xs">建议重新填写更具体的频道想法后再生成</span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="text-amber-700 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-100"
        aria-label="关闭提示"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
