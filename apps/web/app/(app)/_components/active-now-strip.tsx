"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2 } from "lucide-react";

import type { ActivityRow } from "@/lib/dashboard-data";
import { AGENT_LABEL, COMMAND_LABEL } from "@/lib/run-labels";

import { agentDeepLink } from "./activity-feed";

// One-line "what's running right now" strip (rows pre-filtered in dashboard-data).
// Client component: rows slide in/out as the 30s dashboard auto-refresh delivers
// new server data, instead of popping in place.
export function ActiveNowStrip({ active }: { active: ActivityRow[] }) {
  return (
    <AnimatePresence initial={false}>
      {active.length > 0 ? (
        <motion.section
          key="strip"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              正在进行
            </span>
            <AnimatePresence initial={false}>
              {active.map((r) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <Link
                    href={agentDeepLink(r)}
                    className="flex items-center gap-2.5 text-sm hover:underline"
                  >
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                    <span className="font-medium">{AGENT_LABEL[r.agent] ?? r.agent}</span>
                    <span className="truncate">{r.channelName}</span>
                    <span className="text-xs text-muted-foreground">
                      {COMMAND_LABEL[r.command] ?? r.command}
                    </span>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
