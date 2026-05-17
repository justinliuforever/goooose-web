import { AppSidebar } from "@/components/app-sidebar";
import { AuthChip } from "@/components/auth-chip";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <SidebarTrigger className="md:hidden" />
          <span className="ml-auto font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            内测 · 2026 Q3
          </span>
          <AuthChip />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
