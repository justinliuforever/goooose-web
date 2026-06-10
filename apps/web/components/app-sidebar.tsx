"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crosshair, Home, Library, ScanSearch, Tv } from "lucide-react";

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

const START = [
  { label: "工作台", href: "/", icon: Home, end: true },
  { label: "我的账号", href: "/accounts", icon: Tv },
];

const ANALYSIS = [
  { label: "Clerk · 分析师", href: "/clerk", icon: ScanSearch },
  { label: "SOP 库", href: "/sops", icon: Library },
  { label: "对标账号", href: "/competitors", icon: Crosshair },
];

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, end?: boolean) =>
    end ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Sidebar>
      <SidebarHeader className="px-6 pt-10 pb-6">
        <Link href="/" className="font-display text-3xl italic leading-none">
          Singularity
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>开始</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {START.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href, item.end)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>分析与素材</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ANALYSIS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
