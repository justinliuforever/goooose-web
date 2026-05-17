"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Tv } from "lucide-react";

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

const GENERAL = [
  { label: "工作台", href: "/", icon: Home, end: true },
  { label: "频道", href: "/channels", icon: Tv },
];

const AGENTS = [
  { label: "Clerk · 分析师", href: "/clerk", dot: "bg-clerk" },
  { label: "Muse · 选题官", href: "/muse", dot: "bg-muse" },
  { label: "Poet · 写手", href: "/poet", dot: "bg-poet" },
];

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string, end?: boolean) =>
    end ? pathname === href : pathname.startsWith(href.split("/")[1] ? `/${href.split("/")[1]}` : href);

  return (
    <Sidebar>
      <SidebarHeader className="px-6 pt-10 pb-6">
        <Link href="/" className="font-display text-3xl italic leading-none">
          Singularity
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>常用</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {GENERAL.map((item) => (
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
          <SidebarGroupLabel>智能体</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {AGENTS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item.href)}
                  >
                    <span className={`size-[9px] rounded-full ${item.dot}`} />
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
