"use client";

import NumberFlow from "@number-flow/react";
import { useEffect, useState } from "react";

type Props = {
  value: number;
  // Roll up from 0 once on mount (dashboard stats); without it only live
  // value changes animate (run panels). NumberFlow no-ops both under
  // prefers-reduced-motion.
  countUp?: boolean;
  className?: string;
};

export function AnimatedNumber({ value, countUp = false, className }: Props) {
  const [display, setDisplay] = useState(countUp ? 0 : value);
  useEffect(() => {
    // rAF lets the browser paint the previous value first, so NumberFlow sees
    // a real transition (also keeps setState out of the sync effect body).
    const raf = requestAnimationFrame(() => setDisplay(value));
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <NumberFlow value={display} className={className} format={{ useGrouping: false }} />
  );
}
