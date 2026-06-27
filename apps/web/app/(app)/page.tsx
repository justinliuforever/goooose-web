import { redirect } from "next/navigation";

import { getSidebarAccounts } from "@/lib/sidebar-data";
import { ensureCurrentUser } from "@/lib/users";

// 工作台 retired (round 4). Land new users in Clerk (analyze benchmarks first — they have no
// own account yet); land returning users on their first account.
export default async function HomePage() {
  const user = await ensureCurrentUser();
  if (!user) return null;

  const accounts = await getSidebarAccounts(user.id);
  if (accounts.length === 0) redirect("/clerk");
  redirect(`/accounts/${encodeURIComponent(accounts[0]!.slug)}`);
}
