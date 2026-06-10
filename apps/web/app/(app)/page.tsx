import { cnHour } from "@/lib/cn-time";
import { ensureCurrentUser } from "@/lib/users";
import { getDashboardSnapshot } from "@/lib/dashboard-data";

import { AccountsOverview } from "./_components/accounts-overview";
import { ActivityFeed } from "./_components/activity-feed";
import { AgentStatCards } from "./_components/agent-stat-cards";
import { DashboardRefresher } from "./_components/dashboard-refresher";
import { NextStepCard } from "./_components/next-step-card";
import { OnboardingOverview } from "./_components/onboarding-overview";

function greeting(): string {
  const h = cnHour();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

function resolveDisplayName(displayName: string | null, email: string): string | null {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed.split(/\s+/)[0] ?? trimmed;
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  // Strip common digit suffixes like justin123 → justin
  return local.replace(/[._-]?\d+$/, "");
}

export default async function DashboardPage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const snapshot = await getDashboardSnapshot(user.id);
  const name = resolveDisplayName(user.displayName ?? null, user.email);
  const hello = `${greeting()}${name ? `，${name}` : ""}`;

  // With a single account (the 1:1 expand phase), deep-link agent CTAs straight to its default
  // project/tool instead of dumping the user on the account list.
  const solo = snapshot.accounts.length === 1 ? snapshot.accounts[0]! : null;
  const s = solo ? encodeURIComponent(solo.slug) : "";
  const links = solo
    ? {
        clerk: `/clerk/${s}`,
        muse: `/accounts/${s}/projects/${s}/muse`,
        poet: `/accounts/${s}/projects/${s}/poet`,
        projectHub: `/accounts/${s}/projects/${s}`,
      }
    : { clerk: "/clerk", muse: "/accounts", poet: "/accounts", projectHub: "/accounts" };

  if (snapshot.channelCount === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="font-display text-4xl italic">{hello}</h1>
        <p className="text-sm text-muted-foreground">
          Singularity 围绕你自己的频道运转，四步从对标走到成稿。
        </p>
        <OnboardingOverview />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col gap-8 p-6 md:p-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl italic leading-tight md:text-4xl">{hello}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-card px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {snapshot.channelCount} 个频道
            </span>
          </div>
        </div>
        <DashboardRefresher />
      </header>

      <NextStepCard
        channelCount={snapshot.channelCount}
        clerkTotal={snapshot.stats.clerk.total}
        museTotal={snapshot.stats.muse.total}
        poetTotal={snapshot.stats.poet.total}
        pendingMuseIdeas={snapshot.pendingMuseIdeas}
        competitorCount={snapshot.competitorCount}
        links={links}
      />

      <AgentStatCards
        stats={snapshot.stats}
        runningByAgent={snapshot.runningByAgent}
        hrefs={{ clerk: links.clerk, muse: links.muse, poet: links.poet }}
      />

      <AccountsOverview accounts={snapshot.accounts} />

      <ActivityFeed activity={snapshot.activity} />
    </div>
  );
}
