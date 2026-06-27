import { AppSidebar } from "@/components/app-sidebar";
import { AuthChip } from "@/components/auth-chip";
import { ContextHeader } from "@/components/context-header";
import { GlobalRunsIndicator } from "@/components/global-runs-indicator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getSidebarAccounts } from "@/lib/sidebar-data";
import { ensureCurrentUser } from "@/lib/users";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await ensureCurrentUser();
  const accounts = user ? await getSidebarAccounts(user.id) : [];

  return (
    <SidebarProvider>
      <AppSidebar accounts={accounts} />
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <div className="flex items-center gap-1 md:hidden">
            <SidebarTrigger />
            <span className="text-xs text-muted-foreground">菜单</span>
          </div>
          <ContextHeader />
          <div className="ml-auto flex items-center gap-3">
            <GlobalRunsIndicator />
            <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
              内测 · 2026 Q3
            </span>
            <AuthChip />
          </div>
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
