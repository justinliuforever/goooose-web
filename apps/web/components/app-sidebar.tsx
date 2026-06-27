"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Plus, ScanSearch, Tv } from "lucide-react";

import type { SidebarAccount } from "@/lib/sidebar-data";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// SOP 库 is now a tab inside Clerk (clerk-tabs.tsx), not its own nav slot.
const ANALYSIS = [{ label: "Clerk · 分析师", href: "/clerk", icon: ScanSearch }];

export function AppSidebar({ accounts }: { accounts: SidebarAccount[] }) {
  const pathname = usePathname();
  const [accountsOpen, setAccountsOpen] = useState(true);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const accountActive = (slug: string) => {
    const base = `/accounts/${encodeURIComponent(slug)}`;
    return pathname === base || pathname.startsWith(`${base}/`);
  };

  return (
    <Sidebar>
      <SidebarHeader className="px-6 pt-10 pb-6">
        <Link href="/" className="font-display text-3xl italic leading-none">
          Singularity
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>分析与素材</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ANALYSIS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton render={<Link href={item.href} />} isActive={isActive(item.href)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <button
            type="button"
            onClick={() => setAccountsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <span>我的账号</span>
            <ChevronDown
              className={`size-3.5 transition-transform ${accountsOpen ? "" : "-rotate-90"}`}
            />
          </button>
          {accountsOpen ? (
            <SidebarGroupContent>
              <SidebarMenu>
                {accounts.map((a) => (
                  <SidebarMenuItem key={a.slug}>
                    <SidebarMenuButton
                      render={<Link href={`/accounts/${encodeURIComponent(a.slug)}`} />}
                      isActive={accountActive(a.slug)}
                    >
                      <Tv />
                      <span className="truncate">{a.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/accounts/new" />}
                    isActive={pathname === "/accounts/new"}
                    className="text-muted-foreground"
                  >
                    <Plus />
                    <span>新建账号</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          ) : null}
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
